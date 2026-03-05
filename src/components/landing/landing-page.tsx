
import Header from "./header";
import HeroSection from "./hero-section";
import ProblemSection from "./problem-section";
import SolutionSection from "./solution-section";
import Footer from "./footer";

export function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      <main className="flex-1">
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
      </main>
      <Footer />
    </div>
  );
}
