import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { MemberCard } from "./components/MemberCard";
import { MemberGrid } from "./components/MemberGrid";
import { RoleSection } from "./components/RoleSection";
import { members, mods, owner, subMembers } from "./data/members";
import membersStyles from "./components/members.module.css";

/** 自己紹介（メンバー紹介）ページの組み立て */
export function MembersPage() {
  return (
    <PageContainer>
      <RoleSection title="👑 鯖主">
        <MemberCard
          name={owner.name}
          intro={owner.intro}
          rainbow
          illust={owner.illust}
          icon={owner.icon}
          sns={owner.sns}
          etc={owner.etc}
        />
      </RoleSection>

      <RoleSection title="⭐ 副官">
        {subMembers.map((sub) => (
          <MemberCard
            key={sub.name}
            name={sub.name}
            intro={sub.intro}
            nameClassName={membersStyles.subName}
            miniIcon={sub.icon}
          />
        ))}
      </RoleSection>

      <RoleSection title="🛡️ モデレーター">
        {mods.map((mod) => (
          <MemberCard
            key={mod.name}
            name={mod.name}
            intro={mod.intro}
            nameClassName={membersStyles.modName}
          />
        ))}
      </RoleSection>

      <RoleSection title="👥 メンバー">
        <MemberGrid members={members} />
      </RoleSection>

      <Footer />
    </PageContainer>
  );
}
