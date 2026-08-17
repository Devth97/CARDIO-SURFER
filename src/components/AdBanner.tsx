// Reserves the ad slot's layout space either way, so turning on real ads
// later (once a real AdMob account + ad unit ID exists) doesn't shift
// surrounding UI.
export default function AdBanner() {
  const adUnitId = import.meta.env.VITE_ADMOB_BANNER_ID;

  if (!adUnitId) {
    return <div className="ad-banner ad-banner-placeholder" aria-hidden="true" />;
  }

  return <div className="ad-banner" data-ad-unit={adUnitId} />;
}
