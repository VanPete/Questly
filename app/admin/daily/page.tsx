// Legacy page retained but advises using consolidated /admin.
import { redirect } from 'next/navigation';
export default function LegacyAdminDaily() {
	redirect('/admin#daily-quests-debug');
}
