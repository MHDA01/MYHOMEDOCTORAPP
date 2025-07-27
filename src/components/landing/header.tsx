import Link from 'next/link';
import Image from 'next/image';

export default function Header() {
  return (
    <header className="bg-background/80 backdrop-blur-lg fixed top-0 left-0 right-0 z-50 shadow-sm">
      <nav className="container mx-auto px-6 py-3 flex justify-between items-center">
        <Link href="#" className="flex items-center">
          <Image
            src="https://i.postimg.cc/pVd97Wb6/LOGO-2.png"
            alt="My Home Doctor App Logo"
            width={180}
            height={40}
            priority
          />
        </Link>
        <a
          href="/login"
          className="hidden md:inline-block bg-primary text-primary-foreground font-bold py-3 px-8 rounded-full shadow-lg hover:bg-primary/90 transform hover:scale-105 transition-all duration-300 ease-in-out"
        >
          Vamos a la App
        </a>
      </nav>
    </header>
  );
}
