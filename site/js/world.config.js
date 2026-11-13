(function () {
  'use strict';
  var stage = document.getElementById('world');
  if (!stage || typeof window.mountScrollWorld !== 'function') return;

  window.mountScrollWorld(stage, {
    brand: { name: 'Steven Lenz Jr. | Compass', href: '#top' },
    diveScroll: 1.4,
    connScroll: 0.9,
    crossfade: 0.08,
    hint: 'Scroll to look closer',
    nav: true,
    atmosphere: false,
    sections: [
      {
        id: 'lens',
        label: 'Home',
        accent: '#D8A55A',
        scroll: 1.4,
        linger: 0.35,
        still: 'assets/still/lens.webp',
        stillMobile: 'assets/still/lens-m.webp',
        clip: 'assets/vid/lens.mp4',
        clipMobile: 'assets/vid/lens-m.mp4',
        eyebrow: 'Tri-Valley · East Bay · Compass',
        title: 'See Real Estate Through a New Lenz.',
        body: 'Discreet, data-sharp representation for the moments that matter most.',
        tags: ['Pleasanton', 'Danville', 'Walnut Creek', 'San Ramon']
      },
      {
        id: 'roots',
        label: 'Meet Steven',
        accent: '#D8A55A',
        scroll: 1.5,
        linger: 0.45,
        still: 'assets/still/roots.webp',
        stillMobile: 'assets/still/roots-m.webp',
        clip: 'assets/vid/roots.mp4',
        clipMobile: 'assets/vid/roots-m.mp4',
        eyebrow: 'Meet Steven · Compass Luxury',
        title: 'Tri-Valley roots. Coach’s discipline.',
        body: 'Raised in Pleasanton, shaped by Bay Area basketball and nine years coaching at De La Salle & Ohlone College.',
        tags: ['Amador Valley alum', 'De La Salle & Ohlone coach', 'Tri-Valley native']
      },
      {
        id: 'concierge',
        label: 'Services',
        accent: '#D8A55A',
        scroll: 1.6,
        linger: 0.5,
        still: 'assets/still/concierge.webp',
        stillMobile: 'assets/still/concierge-m.webp',
        clip: 'assets/vid/concierge.mp4',
        clipMobile: 'assets/vid/concierge-m.mp4',
        eyebrow: 'Services',
        title: 'Prepare, position, and sell — privately if you prefer.',
        body: 'Buy, sell, Compass Concierge, and Private Exclusives tailored under one roof.',
        tags: ['Buy a Home', 'Sell Your Home', 'Compass Concierge', 'Private Exclusives']
      },
      {
        id: 'portfolio',
        label: 'Featured',
        accent: '#D8A55A',
        scroll: 1.8,
        linger: 0.55,
        still: 'assets/still/portfolio.webp',
        stillMobile: 'assets/still/portfolio-m.webp',
        clip: 'assets/vid/portfolio.mp4',
        clipMobile: 'assets/vid/portfolio-m.mp4',
        eyebrow: 'ACTIVE AND RECENTLY SOLD',
        title: 'Featured Properties',
        body: 'A selection of represented homes and private transactions across the Tri-Valley and East Bay corridor.',
        tags: ['Danville', 'Oakland', 'Pleasanton', 'Alamo', 'Livermore', 'Walnut Creek']
      },
      {
        id: 'communities',
        label: 'Communities',
        accent: '#D8A55A',
        scroll: 1.6,
        linger: 0.5,
        still: 'assets/still/communities.webp',
        stillMobile: 'assets/still/communities-m.webp',
        clip: 'assets/vid/communities.mp4',
        clipMobile: 'assets/vid/communities-m.mp4',
        eyebrow: 'Communities & Neighborhoods',
        title: 'From Tri-Valley Vineyards to Silicon Valley Foothills.',
        body: 'Discover distinct enclaves, school districts, and lifestyle corridors across Northern California.',
        tags: ['Pleasanton', 'Danville & Alamo', 'Livermore', 'Walnut Creek']
      },
      {
        id: 'lounge',
        label: 'Testimonials',
        accent: '#D8A55A',
        scroll: 1.6,
        linger: 0.5,
        still: 'assets/still/lounge.webp',
        stillMobile: 'assets/still/lounge-m.webp',
        clip: 'assets/vid/lounge.mp4',
        clipMobile: 'assets/vid/lounge-m.mp4',
        eyebrow: 'Client Stories & Testimonials',
        title: 'See why families trust Steven with their largest moves.',
        body: 'Discreet, data-sharp negotiations and white-glove client dedication from contract to closing.',
        tags: ['5-Star Rated', 'Discretion', 'Client Loyalty']
      },
      {
        id: 'terrace',
        label: 'Connect',
        accent: '#D8A55A',
        scroll: 2.6,
        linger: 0.6,
        still: 'assets/still/terrace.webp',
        stillMobile: 'assets/still/terrace-m.webp',
        clip: 'assets/vid/terrace.mp4',
        clipMobile: 'assets/vid/terrace-m.mp4',
        eyebrow: "Let's Connect",
        title: 'Your next move, in focus.',
        body: 'Tell Steven what you’re looking for — he replies personally.'
      }
    ],
    connectors: [null, null, null, null, null, null],
    connectorsMobile: [null, null, null, null, null, null]
  });
})();
