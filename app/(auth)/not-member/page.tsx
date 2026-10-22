import { PageContainer } from "@/components/ui/page-container";
import { SignOutButton } from "./sign-out";

/** 登录了、但不在使用名单（IDEAOS_USER_EMAIL / IDEAOS_MEMBERS）上的账号停在这里。 */
export default function NotMemberPage() {
  return (
    <PageContainer width="narrow">
      <div className="mt-24 space-y-4 text-sm leading-7">
        <h1 className="text-lg font-semibold">这里还没对你开放</h1>
        <p className="text-muted-foreground">
          这个网站现在只给几个人用。想用的话，请告诉让你来注册的那个人：把你注册用的邮箱加进名单以后，重新登录就能用了。
        </p>
        <SignOutButton />
      </div>
    </PageContainer>
  );
}
