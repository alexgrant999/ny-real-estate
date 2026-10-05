'use client';
import { useState, useEffect, useRef } from 'react';
import type { ImportLog } from '@/lib/types';
import { REGIONS, REGION_LABELS, TOWNS, TOWNS_BY_REGION } from '@/lib/areas';

type TestResult = { ok: boolean; message: string };

export default function ImportPage() {
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(TOWNS.filter(t => t.active).map(t => t.slug)),
  );

  // Connection test
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Live log
  const [activeLogId, setActiveLogId] = useState<number | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logDone, setLogDone] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchLogs = async () => {
    const res = await fetch('/api/import');
    const data = await res.json();
    setLogs(Array.isArray(data) ? data : []);
  };

  useEffect(() => { fetchLogs(); }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logLines]);

  useEffect(() => {
    if (!activeLogId || logDone) return;
    const poll = async () => {
      const res = await fetch(`/api/import/log?id=${activeLogId}`);
      const data = await res.json();
      setLogLines(data.lines ?? []);
      if (data.status === 'success' || data.status === 'error') {
        setLogDone(true);
        setLoading(null);
        fetchLogs();
      }
    };
    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeLogId, logDone]);

  const toggleTown = (slug: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  };

  const toggleRegion = (region: keyof typeof TOWNS_BY_REGION) => {
    const slugs = TOWNS_BY_REGION[region].map(t => t.slug);
    const allOn = slugs.every(s => selected.has(s));
    setSelected(prev => {
      const next = new Set(prev);
      for (const s of slugs) { if (allOn) next.delete(s); else next.add(s); }
      return next;
    });
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/import/test');
      const data = (await res.json()) as TestResult;
      setTestResult(data);
    } catch (e) {
      setTestResult({ ok: false, message: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const runImport = async (source: 'redfin' | 'demo') => {
    setLoading(source);
    setLogLines([]);
    setLogDone(false);
    setActiveLogId(null);
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          source === 'redfin'
            ? { sources: ['redfin'], towns: Array.from(selected) }
            : { sources: ['demo'] },
        ),
      });
      const data = await res.json();
      if (data.logId) {
        setActiveLogId(data.logId);
      } else {
        setLoading(null);
        setTimeout(fetchLogs, 3000);
      }
    } catch {
      setLoading(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Import Data</h1>
      <p className="text-gray-500 text-sm mb-6">Pull live Catskills listings into the local database.</p>

      {/* Redfin */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              Redfin Import
              <span className="text-xs font-normal px-2 py-0.5 bg-green-100 text-green-700 rounded-full">live data</span>
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Pulls active for-sale listings from Redfin for the selected towns. No API key needed.
            </p>
            <ul className="mt-1 text-xs text-gray-400 space-y-0.5">
              <li>~1.5s between requests · price changes recorded as history · taxes and MLS price history fetched for new listings</li>
            </ul>
            {testResult && (
              <p className={`mt-2 text-xs ${testResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                {testResult.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <button
              onClick={() => runImport('redfin')}
              disabled={loading !== null || selected.size === 0}
              className="px-4 py-2 bg-[#a02021] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading === 'redfin' ? 'Running...' : `Run Import (${selected.size})`}
            </button>
            <button
              onClick={testConnection}
              disabled={testing || loading !== null}
              className="px-4 py-2 bg-white text-gray-700 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {testing ? 'Testing...' : 'Test connection'}
            </button>
          </div>
        </div>

        {/* Town toggles */}
        <div className="border-t border-gray-100 pt-4 space-y-4">
          {REGIONS.map(region => {
            const towns = TOWNS_BY_REGION[region];
            const allOn = towns.every(t => selected.has(t.slug));
            const someOn = towns.some(t => selected.has(t.slug));
            return (
              <div key={region}>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => toggleRegion(region)}
                    className={`text-xs font-semibold px-2 py-0.5 rounded border transition-colors ${
                      allOn ? 'bg-gray-900 text-white border-gray-900'
                      : someOn ? 'bg-gray-100 text-gray-700 border-gray-300'
                      : 'bg-white text-gray-400 border-gray-200'
                    }`}
                  >
                    {REGION_LABELS[region]}
                  </button>
                  <span className="text-xs text-gray-400">
                    {towns.filter(t => selected.has(t.slug)).length}/{towns.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {towns.map(town => (
                    <button
                      key={town.slug}
                      onClick={() => toggleTown(town.slug)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        selected.has(town.slug)
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700'
                      }`}
                    >
                      {town.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live log */}
      {(logLines.length > 0 || (loading === 'redfin' && activeLogId)) && (
        <div className="mb-4 bg-gray-950 rounded-xl border border-gray-800 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
            <span className="text-xs font-mono text-gray-400">
              {logDone ? '● done' : '● running'}
            </span>
            <button
              onClick={() => { setLogLines([]); setActiveLogId(null); }}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              clear
            </button>
          </div>
          <div
            ref={logRef}
            className="h-64 overflow-y-auto px-4 py-3 font-mono text-xs text-gray-300 space-y-0.5"
          >
            {logLines.length === 0 ? (
              <span className="text-gray-500">Starting...</span>
            ) : (
              logLines.map((line, i) => (
                <div key={i} className={
                  line.includes('✓') ? 'text-green-400' :
                  line.includes('blocked') || line.includes('Fatal') ? 'text-yellow-400' :
                  line.startsWith('──') || line.startsWith('Scraping') ? 'text-blue-400' :
                  'text-gray-300'
                }>
                  {line}
                </div>
              ))
            )}
            {!logDone && <div className="text-gray-500 animate-pulse">▌</div>}
          </div>
        </div>
      )}

      {/* Demo data */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Demo Data</h2>
            <p className="text-sm text-gray-500 mt-1">
              Generate ~300 fake Catskills listings for testing filters and charts.
            </p>
          </div>
          <button
            onClick={() => runImport('demo')}
            disabled={loading !== null}
            className="shrink-0 px-4 py-2 bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {loading === 'demo' ? 'Starting...' : 'Load demo data'}
          </button>
        </div>
      </div>

      {/* Import history */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-900">Import History</h2>
        <button onClick={fetchLogs} className="text-sm text-blue-600 hover:text-blue-800">Refresh</button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {logs.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">No import history yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Source</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Status</th>
                <th className="text-right px-4 py-2 text-gray-600 font-medium">Added</th>
                <th className="text-right px-4 py-2 text-gray-600 font-medium">Updated</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Started</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map(log => (
                <tr key={log.id}>
                  <td className="px-4 py-2.5 font-medium text-gray-900 capitalize">{log.source}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      log.status === 'success' ? 'bg-green-100 text-green-800' :
                      log.status === 'error'   ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{log.listings_added}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{log.listings_updated}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">
                    {log.started_at
                      ? new Date(log.started_at + 'Z').toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                      : ''}
                  </td>
                  <td className="px-4 py-2.5 text-red-500 text-xs max-w-xs truncate">{log.error_message ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
