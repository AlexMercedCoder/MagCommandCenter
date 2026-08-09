export type PerformanceMetric = {
  name: string;
  durationMs: number;
  budgetMs: number;
  ok: boolean;
  measuredAt: string;
};

export const performanceBudgets: Record<string, number> = {
  "desktop.startup": 3000,
  "project.switch": 750,
  "task.first_activity": 2000,
  "memory.search": 1200,
  "sqlite.query": 1500
};

const measurements: PerformanceMetric[] = [];

export function recordPerformance(name: string, startedAt: number, endedAt = performance.now()): PerformanceMetric {
  const durationMs = Math.max(0, Math.round((endedAt - startedAt) * 10) / 10);
  const budgetMs = performanceBudgets[name] ?? 2000;
  const metric = { name, durationMs, budgetMs, ok: durationMs <= budgetMs, measuredAt: new Date().toISOString() };
  measurements.unshift(metric);
  measurements.splice(100);
  return metric;
}

export function performanceReport() {
  return { schema: "mag-command-center.performance.v1", budgets: performanceBudgets, measurements: [...measurements] };
}

export async function measurePerformance<T>(name: string, operation: () => Promise<T>): Promise<T> {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    recordPerformance(name, startedAt);
  }
}
