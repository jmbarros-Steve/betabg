import logoShopify from '@/assets/logo-shopify-clean.png';
import logoMeta from '@/assets/logo-meta-clean.png';
import logoGoogle from '@/assets/logo-google-ads.png';
import logoKlaviyo from '@/assets/logo-klaviyo-clean.png';

const logos = [
  { src: logoShopify, alt: 'Shopify' },
  { src: logoMeta, alt: 'Meta' },
  { src: logoGoogle, alt: 'Google Ads' },
  { src: logoKlaviyo, alt: 'Klaviyo' },
];

export function LogoBar() {
  const allLogos = [...logos, ...logos, ...logos, ...logos];

  return (
    <section className="bg-white border-y border-slate-200 py-6 overflow-hidden">
      <div className="flex animate-marquee" style={{ width: 'max-content' }}>
        {allLogos.map((logo, i) => (
          <div key={i} className="flex-shrink-0 mx-10 flex items-center">
            <img
              src={logo.src}
              alt={logo.alt}
              className="h-8 object-contain grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-300"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
