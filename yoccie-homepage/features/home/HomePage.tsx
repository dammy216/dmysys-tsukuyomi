import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { Hero } from "./components/Hero";
import { ServerIntro } from "./components/ServerIntro";

/** ホーム（トップページ）の組み立て */
export function HomePage() {
  return (
    <PageContainer>
      <Hero />
      <ServerIntro />
      <Footer meta={{ lastUpdated: "2026年6月22日", version: "1.2.0" }} />
    </PageContainer>
  );
}
