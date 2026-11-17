(function () {
  'use strict';
  var stage = document.getElementById('world');
  if (!stage || typeof window.mountScrollWorld !== 'function') return;

  window.mountScrollWorld(stage, {
    brand: { name: 'Steven Lenz Jr. | Compass', href: '#top' },
    diveScroll: 1.4,
    connScroll: 0.9,
    crossfade: 0.22,
    hint: 'Scroll to explore 3466 Jackson St',
    nav: true,
    atmosphere: false,
    sections: [
      {
        id: 'arrival',
        label: '3466 Jackson',
        accent: '#D8A55A',
        scroll: 1.5,
        linger: 0.35,
        still: 'assets/still/v2/arrival.webp',
        stillMobile: 'assets/still/v2/arrival-m.webp',
        clip: 'assets/vid/v2/arrival.mp4',
        clipMobile: 'assets/vid/v2/arrival-m.mp4',
        eyebrow: 'Presidio Heights Landmark · $16,250,000',
        title: 'See San Francisco Through a New Lenz.',
        body: '6,300 sq.ft. of classical 1912 architectural heritage commanding unobstructed Golden Gate views across all four levels.',
        tags: ['Presidio Heights', '7 Beds · 5.5 Baths', '6,300 Sq.Ft.', 'Flat Block']
      },
      {
        id: 'salon',
        label: 'The Salons',
        accent: '#D8A55A',
        scroll: 1.5,
        linger: 0.45,
        still: 'assets/still/v2/salon.webp',
        stillMobile: 'assets/still/v2/salon-m.webp',
        clip: 'assets/vid/v2/salon.mp4',
        clipMobile: 'assets/vid/v2/salon-m.mp4',
        eyebrow: 'Grand Entertaining Level',
        title: 'Soaring 12-Foot Ceilings & Period Millwork.',
        body: 'Grand living room with carved marble fireplace opening through multiple French doors to an expansive bay-view balcony, alongside a sun-drenched formal dining salon.',
        tags: ['Carved Marble Hearth', 'Formal South-Facing Dining', 'French Doors']
      },
      {
        id: 'culinary',
        label: 'Kitchen & Nook',
        accent: '#D8A55A',
        scroll: 1.5,
        linger: 0.45,
        still: 'assets/still/v2/culinary.webp',
        stillMobile: 'assets/still/v2/culinary-m.webp',
        clip: 'assets/vid/v2/culinary.mp4',
        clipMobile: 'assets/vid/v2/culinary-m.mp4',
        eyebrow: 'The Culinary Hearth',
        title: 'Morning Light Over the North Bay.',
        body: 'Chef’s kitchen with custom cabinetry, premium suite of appliances, and breakfast banquette framing northern light and Pacific breezes.',
        tags: ['Chef Kitchen', 'Breakfast Banquette', 'Pacific Light']
      },
      {
        id: 'primary',
        label: 'Primary Suite',
        accent: '#D8A55A',
        scroll: 1.6,
        linger: 0.5,
        still: 'assets/still/v2/primary.webp',
        stillMobile: 'assets/still/v2/primary-m.webp',
        clip: 'assets/vid/v2/primary.mp4',
        clipMobile: 'assets/vid/v2/primary-m.mp4',
        eyebrow: 'Upper Level Retreat',
        title: 'Private Fireplace Lounge & Vintage Baths.',
        body: 'Serene primary suite featuring a fireplace, sitting area, glass French doors, and classic clawfoot soaking tubs.',
        tags: ['Fireplace Suite', 'Private Sitting Lounge', 'Clawfoot Soaking Tub']
      },
      {
        id: 'framing',
        label: 'Iconic Framing',
        accent: '#D8A55A',
        scroll: 1.6,
        linger: 0.5,
        still: 'assets/still/v2/framing.webp',
        stillMobile: 'assets/still/v2/framing-m.webp',
        clip: 'assets/vid/v2/framing.mp4',
        clipMobile: 'assets/vid/v2/framing-m.mp4',
        eyebrow: 'Through the French Doors',
        title: 'Unobstructed Water Panoramas.',
        body: 'Approaching the glass French doors as the Marin Headlands, Alcatraz, and the bay fill the frame from all four levels.',
        tags: ['Alcatraz Views', 'Marin Headlands', 'French Door Framing']
      },
      {
        id: 'bridge',
        label: 'Golden Gate View',
        accent: '#D8A55A',
        scroll: 1.8,
        linger: 0.55,
        still: 'assets/still/v2/bridge.webp',
        stillMobile: 'assets/still/v2/bridge-m.webp',
        clip: 'assets/vid/v2/bridge.mp4',
        clipMobile: 'assets/vid/v2/bridge-m.mp4',
        eyebrow: 'The Optical Revelation',
        title: 'The Golden Gate Bridge, in Sharp Focus.',
        body: 'Step onto the private terrace balcony as the camera lens zooms optically in—revealing San Francisco’s most iconic suspension towers standing in dramatic, irreplaceable detail.',
        tags: ['Golden Gate Bridge', 'Full Optical Zoom', 'Entertaining Terrace']
      },
      {
        id: 'oasis',
        label: 'Garden Sanctuary',
        accent: '#D8A55A',
        scroll: 2.4,
        linger: 0.6,
        still: 'assets/still/v2/oasis.webp',
        stillMobile: 'assets/still/v2/oasis-m.webp',
        clip: 'assets/vid/v2/oasis.mp4',
        clipMobile: 'assets/vid/v2/oasis-m.mp4',
        eyebrow: 'Private Outdoor Oasis',
        title: 'A Deep Rear Garden & Guest Apartment.',
        body: 'Multi-tiered entertaining decks descending into a secluded garden sanctuary, complete with separate 1-bed guest residence. Represented with discretion by Steven Lenz Jr.'
      }
    ],
    connectors: [null, null, null, null, null, null],
    connectorsMobile: [null, null, null, null, null, null]
  });
})();

