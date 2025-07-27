
import DownloadSection from "./download-section";
import Footer from "./footer";
import Header from "./header";
import HeroSection from "./hero-section";
import ProblemSection from "./problem-section";
import SecuritySection from "./security-section";
import SolutionSection from "./solution-section";

export function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-1">
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
        <SecuritySection />
        <DownloadSection />
      </main>
      <Footer />
    </div>
  );
}
