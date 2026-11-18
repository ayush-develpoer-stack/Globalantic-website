import Link from 'next/link';
import { Logo } from '@globalantic/ui';
import { siteUrls } from '@/lib/config';
import s from '@/styles/site.module.css';

export function SiteFooter() {
  return (
    <footer className={s.footer}>
      <div className="container">
        <div className={s.footerGrid}>
          <div>
            <p className={s.footerBrand} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Logo size={30} /> Globalantic Training
            </p>
            <p>Training programmes and internships offered by Globalantic, an IT &amp; digital solutions company.</p>
          </div>
          <div>
            <h2>Learn</h2>
            <ul>
              <li><Link href="/courses">All courses</Link></li>
              <li><Link href="/batches">Upcoming batches</Link></li>
              <li><Link href="/programs/training">Training programmes</Link></li>
              <li><Link href="/programs/internship">Internships</Link></li>
              <li><Link href="/programs/certificate">Certificate program</Link></li>
              <li><Link href="/learning-modes">Online &amp; offline</Link></li>
            </ul>
          </div>
          <div>
            <h2>Admissions</h2>
            <ul>
              <li><Link href="/register">Register</Link></li>
              <li><Link href="/application-status">Application status</Link></li>
              <li><Link href="/fees">Fees &amp; payments</Link></li>
              <li><Link href="/referral">Referral programme</Link></li>
              <li><Link href="/certificates/verify">Verify a certificate</Link></li>
            </ul>
          </div>
          <div>
            <h2>Help</h2>
            <ul>
              <li><Link href="/faq">FAQ</Link></li>
              <li><Link href="/contact">Contact us</Link></li>
              <li><Link href="/terms">Terms</Link></li>
              <li><Link href="/privacy">Privacy</Link></li>
              <li><a href={siteUrls.mainSite}>Globalantic.com</a></li>
            </ul>
          </div>
        </div>
        <div className={s.footerBottom}>
          <span>© {new Date().getFullYear()} Globalantic. All rights reserved.</span>
          <span>Payments are processed securely by Razorpay.</span>
        </div>
      </div>
    </footer>
  );
}
