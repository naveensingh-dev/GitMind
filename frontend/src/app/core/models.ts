export interface ReviewItem {
  issue: string;
  severity: 'high' | 'medium' | 'low';
  file_path?: string;
  line_number?: number;
  line?: string;
  fix: string;
  confidence?: number;
  found_by?: string[];
}

export interface ReviewReport {
  security: ReviewItem[];
  performance: ReviewItem[];
  style: ReviewItem[];
  summary: string;
  approval_status: 'approved' | 'needs_changes' | 'rejected';
  confidence_score: number;
  auto_fixes?: any;
  generated_tests?: any;
  arch_review?: any;
}

export interface DiffLine {
  content: string;
  type: 'added' | 'removed' | 'neutral';
  leftLine?: number;
  rightLine?: number;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  isOpen: boolean;
}

export interface TrendData {
  date: string;
  score: number;
  count: number;
}

export interface DashboardMetrics {
  totalReviews: number;
  totalThreats: number;
  highSev: number;
  avgConf: number;
  sumSec: number;
  sumPerf: number;
  sumStyle: number;
  secPct: number;
  perfPct: number;
  stylePct: number;
  trend: TrendData[];
}
