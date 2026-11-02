import { Bricolage_Grotesque } from 'next/font/google';
import './globals.css';

const font = Bricolage_Grotesque({ subsets: ['latin'], display: 'swap' });

export const metadata = {
  title: 'digestai.job',
  description:
    'Proyek AI dari berbagai platform, terkumpul di satu tempat. Klik proyek untuk lanjut ke platform aslinya.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className={font.className}>{children}</body>
    </html>
  );
}
