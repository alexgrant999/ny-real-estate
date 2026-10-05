export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type ProjectStatus = 'active' | 'archived' | 'planning';
export type InstructionType =
  | 'architecture'
  | 'convention'
  | 'workflow'
  | 'security'
  | 'deployment'
  | 'data_model'
  | 'integration'
  | 'constraint';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  tech_stack: Json;
  status: ProjectStatus;
  repo_url: string | null;
  live_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PromptProfile {
  id: string;
  project_id: string | null;
  name: string;
  purpose: string | null;
  model_provider: string;
  model_id: string;
  active_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PromptVersion {
  id: string;
  profile_id: string;
  version_number: number;
  system_prompt: string;
  developer_prompt: string | null;
  tools_policy: Json | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ProjectInstruction {
  id: string;
  project_id: string | null;
  instruction_type: InstructionType;
  title: string;
  content: string;
  priority: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Integration {
  id: string;
  name: string;
  slug: string;
  category: string;
  docs_url: string | null;
  auth_method: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface HowToGuide {
  id: string;
  project_id: string | null;
  integration_id: string | null;
  title: string;
  slug: string;
  content: string;
  tags: string[];
  difficulty: Difficulty | null;
  created_at: string;
  updated_at: string;
}

export interface UserPreference {
  id: string;
  project_id: string | null;
  category: string;
  key: string;
  value: string;
  updated_at: string;
}

export interface PromptRun {
  id: string;
  project_id: string | null;
  prompt_version_id: string | null;
  model_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  input_summary: string | null;
  output_summary: string | null;
  duration_ms: number | null;
  error: string | null;
  metadata: Json | null;
  created_at: string;
}
