import Link from 'next/link';
import Image from 'next/image';

export default function Header() {
  return (
    <header className="bg-background/80 backdrop-blur-lg fixed top-0 left-0 right-0 z-50 shadow-sm">
      <nav className="container mx-auto px-6 py-3 flex justify-between items-center">
        <Link href="#" className="flex items-center">
          <Image
            src="https://i.postimg.cc/MTjtbjPt/LOGO.png"
            alt="My Home Doctor App Logo"
            width={180}
            height={40}
            priority
          />
        </Link>
      </nav>
    </header>
  );
}
