import { Bricolage_Grotesque } from 'next/font/google';
import './globals.css';

const font = Bricolage_Grotesque({ subsets: ['latin'], display: 'swap' });

export const metadata = {
  title: 'The AITrainer',
  description:
    'AI training projects from many platforms, collected in one place. Click a project to apply on the original platform.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={font.className}>{children}</body>
    </html>
  );
}
