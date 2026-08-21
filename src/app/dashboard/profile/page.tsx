import { requireUser } from "@/lib/auth";
import { ProfileForm } from "./profile-form";
import { Card, CardContent } from "@/components/ui/card";

export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <div className="max-w-lg">
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">Profile</h1>
      <Card className="mt-6">
        <CardContent className="p-6">
          <ProfileForm email={user.email ?? ""} fullName={user.profile.full_name ?? ""} />
        </CardContent>
      </Card>
    </div>
  );
}
