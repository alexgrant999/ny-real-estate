/**
 * Claude Brain — TypeScript client
 *
 * Import this into any project to load prompts, instructions,
 * and how-to guides from the central Postgres brain DB.
 *
 * Usage:
 *   import { brain } from '@/lib/brain';
 *   const prompt = await brain.getActivePrompt('playday', 'booking-assistant');
 *   const context = await brain.composeSystemPrompt('playday');
 */

import postgres from 'postgres';

const sql = postgres(process.env.CLAUDE_BRAIN_DATABASE_URL!);

// ─── Types ────────────────────────────────────────────────────

export interface ComposedPrompt {
  system: string;
  developer?: string;
  profileId: string;
  versionId: string;
  versionNumber: number;
}

export interface ProjectContext {
  project: { id: string; name: string; slug: string; description: string | null };
  instructions: { type: string; title: string; content: string }[];
  preferences: { category: string; key: string; value: string }[];
}

// ─── Core ─────────────────────────────────────────────────────

export const brain = {

  /**
   * Get the active prompt for a named profile within a project.
   * Falls back to a global profile with the same name if no project-scoped one exists.
   */
  async getActivePrompt(projectSlug: string, profileName: string): Promise<ComposedPrompt | null> {
    const [row] = await sql`
      SELECT
        pp.id,
        pp.active_version_id,
        pv.id           AS version_id,
        pv.version_number,
        pv.system_prompt,
        pv.developer_prompt
      FROM prompt_profiles pp
      LEFT JOIN prompt_versions pv ON pv.id = pp.active_version_id
      LEFT JOIN projects pr ON pr.id = pp.project_id
      WHERE pp.name = ${profileName}
        AND pr.slug = ${projectSlug}
      LIMIT 1
    `;

    // Fall back to global (project_id IS NULL)
    const resolved = row ?? (await sql`
      SELECT
        pp.id,
        pp.active_version_id,
        pv.id           AS version_id,
        pv.version_number,
        pv.system_prompt,
        pv.developer_prompt
      FROM prompt_profiles pp
      LEFT JOIN prompt_versions pv ON pv.id = pp.active_version_id
      WHERE pp.name = ${profileName}
        AND pp.project_id IS NULL
      LIMIT 1
    `)[0];

    if (!resolved?.active_version_id) return null;

    return {
      system: resolved.system_prompt as string,
      developer: (resolved.developer_prompt as string | null) ?? undefined,
      profileId: resolved.id as string,
      versionId: resolved.version_id as string,
      versionNumber: resolved.version_number as number,
    };
  },

  /**
   * Compose a full layered system prompt for a project.
   * Layer order: global instructions → project instructions → user preferences
   */
  async composeSystemPrompt(projectSlug: string): Promise<string> {
    const [project] = await sql`
      SELECT id, name, slug, description FROM projects WHERE slug = ${projectSlug} LIMIT 1
    `;
    if (!project) throw new Error(`Project not found: ${projectSlug}`);

    const [globalInstructions, projectInstructions, preferences] = await Promise.all([
      sql`
        SELECT instruction_type, title, content, priority
        FROM project_instructions
        WHERE project_id IS NULL AND active = true
        ORDER BY priority
      `,
      sql`
        SELECT instruction_type, title, content, priority
        FROM project_instructions
        WHERE project_id = ${project.id as string} AND active = true
        ORDER BY priority
      `,
      sql`
        SELECT category, key, value, project_id
        FROM user_preferences
        WHERE project_id IS NULL OR project_id = ${project.id as string}
      `,
    ]);

    const sections: string[] = [];

    if (project.description) {
      sections.push(`## Project: ${project.name}\n${project.description}`);
    }

    const allInstructions = [...globalInstructions, ...projectInstructions];

    if (allInstructions.length > 0) {
      const grouped = allInstructions.reduce<Record<string, string[]>>((acc, i) => {
        (acc[i.instruction_type as string] ??= []).push(`### ${i.title}\n${i.content}`);
        return acc;
      }, {});

      for (const [type, items] of Object.entries(grouped)) {
        sections.push(`## ${type.replace(/_/g, ' ').toUpperCase()}\n${items.join('\n\n')}`);
      }
    }

    if (preferences.length > 0) {
      const prefLines = preferences.map(p => `- **${p.category} / ${p.key}**: ${p.value}`);
      sections.push(`## PREFERENCES\n${prefLines.join('\n')}`);
    }

    return sections.join('\n\n---\n\n');
  },

  /**
   * Load project context — useful for priming a conversation.
   */
  async getProjectContext(projectSlug: string): Promise<ProjectContext | null> {
    const [project] = await sql`
      SELECT id, name, slug, description FROM projects WHERE slug = ${projectSlug} LIMIT 1
    `;
    if (!project) return null;

    const [instructions, preferences] = await Promise.all([
      sql`
        SELECT instruction_type, title, content
        FROM project_instructions
        WHERE (project_id IS NULL OR project_id = ${project.id as string})
          AND active = true
        ORDER BY priority
      `,
      sql`
        SELECT category, key, value
        FROM user_preferences
        WHERE project_id IS NULL OR project_id = ${project.id as string}
      `,
    ]);

    return {
      project: project as ProjectContext['project'],
      instructions: instructions.map(i => ({ type: i.instruction_type as string, title: i.title as string, content: i.content as string })),
      preferences: preferences.map(p => ({ category: p.category as string, key: p.key as string, value: p.value as string })),
    };
  },

  /**
   * Fetch a how-to guide by slug.
   */
  async getHowTo(slug: string) {
    const [row] = await sql`
      SELECT * FROM how_to_guides WHERE slug = ${slug} LIMIT 1
    `;
    return row ?? null;
  },

  /**
   * Search how-to guides by project and/or tags.
   */
  async searchHowTos(opts: { projectSlug?: string; tags?: string[]; query?: string }) {
    let projectId: string | null = null;
    if (opts.projectSlug) {
      const [project] = await sql`SELECT id FROM projects WHERE slug = ${opts.projectSlug} LIMIT 1`;
      projectId = (project?.id as string) ?? null;
    }

    return sql`
      SELECT id, title, slug, tags, difficulty, project_id, integration_id
      FROM how_to_guides
      WHERE TRUE
        ${projectId !== null ? sql`AND project_id = ${projectId}` : sql``}
        ${opts.tags?.length ? sql`AND tags && ${sql.array(opts.tags)}` : sql``}
        ${opts.query ? sql`AND title ILIKE ${'%' + opts.query + '%'}` : sql``}
      ORDER BY updated_at DESC
    `;
  },

  /**
   * Start a new conversation session for a project.
   * Returns the sessionId — pass it to logMessage() on every turn.
   */
  async startSession(projectSlug: string): Promise<string> {
    let projectId: string | null = null;
    if (projectSlug) {
      const [project] = await sql`SELECT id FROM projects WHERE slug = ${projectSlug} LIMIT 1`;
      projectId = (project?.id as string) ?? null;
    }
    const [row] = await sql`
      INSERT INTO conversation_sessions (project_id) VALUES (${projectId}) RETURNING id
    `;
    return row.id as string;
  },

  /**
   * Append a message to an existing session.
   */
  async logMessage(sessionId: string, role: 'user' | 'assistant' | 'system', content: string): Promise<void> {
    await sql`
      INSERT INTO conversation_messages (session_id, role, content)
      VALUES (${sessionId}, ${role}, ${content})
    `;
  },

  /**
   * Mark a session as ended. Ended sessions are eligible for distillation.
   */
  async endSession(sessionId: string): Promise<void> {
    await sql`
      UPDATE conversation_sessions SET ended_at = now() WHERE id = ${sessionId}
    `;
  },

  /**
   * Log a prompt run for observability.
   */
  async logRun(run: {
    projectSlug?: string;
    promptVersionId?: string;
    modelId?: string;
    inputTokens?: number;
    outputTokens?: number;
    durationMs?: number;
    inputSummary?: string;
    outputSummary?: string;
    error?: string;
    metadata?: Record<string, unknown>;
  }) {
    let projectId: string | null = null;
    if (run.projectSlug) {
      const [project] = await sql`SELECT id FROM projects WHERE slug = ${run.projectSlug} LIMIT 1`;
      projectId = (project?.id as string) ?? null;
    }

    await sql`
      INSERT INTO prompt_runs
        (project_id, prompt_version_id, model_id, input_tokens, output_tokens,
         duration_ms, input_summary, output_summary, error, metadata)
      VALUES
        (${projectId}, ${run.promptVersionId ?? null}, ${run.modelId ?? null},
         ${run.inputTokens ?? null}, ${run.outputTokens ?? null},
         ${run.durationMs ?? null}, ${run.inputSummary ?? null},
         ${run.outputSummary ?? null}, ${run.error ?? null},
         ${run.metadata ? sql.json(run.metadata as Parameters<typeof sql.json>[0]) : null})
    `;
  },
};
