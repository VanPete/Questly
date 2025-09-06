// Intentionally minimal server file that delegates to client component.

export const dynamic = 'force-dynamic';

export default function DailyPage() {
  return <DailyPageClient />;
}

// Moved client logic out for premium-aware refetch after hydration
import DailyPageClient from '@/components/DailyPageClient';

