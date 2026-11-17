/**
 * overlays.v2.js — Interactive overlays and gallery for 3466 Jackson St (Landing Page V2)
 * Steven Lenz Jr. | Compass Real Estate
 */
(function () {
  'use strict';

  var JACKSON_PHOTOS = [
    { src: 'assets/jackson-st/01_golden_gate_view.webp', caption: 'Unobstructed Golden Gate Bridge & Bay View from Terrace' },
    { src: 'assets/jackson-st/02_facade_elevation.webp', caption: 'Grand 1912 Classical Facade on Flat Block of Jackson St' },
    { src: 'assets/jackson-st/03_living_room.webp', caption: 'Grand Living Room with Marble Fireplace & Soaring Ceilings' },
    { src: 'assets/jackson-st/04_dining_room.webp', caption: 'Sun-Drenched Formal South-Facing Dining Room' },
    { src: 'assets/jackson-st/05_kitchen.webp', caption: 'Chef\'s Kitchen & Breakfast Nook with Northern Light' },
    { src: 'assets/jackson-st/06_primary_bedroom.webp', caption: 'Upper Level Primary Suite with Fireplace' },
    { src: 'assets/jackson-st/07_primary_sitting.webp', caption: 'Primary Suite Private Sitting Lounge & French Doors' },
    { src: 'assets/jackson-st/08_primary_bay_view.webp', caption: 'Bay & Bridge Views Framed by French Doors' },
    { src: 'assets/jackson-st/09_bedroom_2.webp', caption: 'Upper Level Guest Bedroom with Garden Views' },
    { src: 'assets/jackson-st/10_vintage_bath.webp', caption: 'Restored Vintage Architectural Bath' },
    { src: 'assets/jackson-st/11_top_view_bedroom.webp', caption: 'Top Floor Panoramic View Bedroom' },
    { src: 'assets/jackson-st/12_top_bedroom_office.webp', caption: 'Top Floor Executive Office / 4th Bedroom' },
    { src: 'assets/jackson-st/13_clawfoot_bath.webp', caption: 'Top Floor Classic Clawfoot Soaking Tub Bath' },
    { src: 'assets/jackson-st/14_playroom_lounge.webp', caption: 'Top Floor Playroom / Executive Media Lounge' },
    { src: 'assets/jackson-st/15_guest_living.webp', caption: 'Ground Level 1-Bed Guest Apartment Living Room' },
    { src: 'assets/jackson-st/16_guest_bedroom.webp', caption: 'Guest Apartment Bedroom with Garden Deck Access' },
    { src: 'assets/jackson-st/17_view_terrace.webp', caption: 'Upper Level Entertaining Terrace Overlooking the Bay' },
    { src: 'assets/jackson-st/18_garden_deck.webp', caption: 'Terraced Dining Deck Descending to Garden' },
    { src: 'assets/jackson-st/19_rear_garden_oasis.webp', caption: 'Deep, Lush Rear Garden Sanctuary' },
    { src: 'assets/jackson-st/20_garden_pathway.webp', caption: 'Secluded Garden Path & Private Outdoor Grounds' }
  ];

  function initGallery() {
    var galleryTrack = document.getElementById('v2-gallery-track');
    var galleryCount = document.getElementById('v2-gallery-count');
    var prevBtn = document.getElementById('v2-gallery-prev');
    var nextBtn = document.getElementById('v2-gallery-next');

    if (!galleryTrack) return;

    galleryTrack.innerHTML = JACKSON_PHOTOS.map(function (p, idx) {
      return '<div class="v2-gallery-item" data-idx="' + idx + '">' +
        '<img src="' + p.src + '" alt="' + p.caption + '" loading="lazy" width="373" height="280" />' +
        '<div class="v2-gallery-cap">' + p.caption + '</div>' +
        '</div>';
    }).join('');

    if (galleryCount) galleryCount.textContent = '20 Photographs';

    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        galleryTrack.scrollBy({ left: -320, behavior: 'smooth' });
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        galleryTrack.scrollBy({ left: 320, behavior: 'smooth' });
      });
    }
  }

  function initShowingForm() {
    var form = document.getElementById('v2-showing-form');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = (document.getElementById('v2-name') || {}).value || '';
      var email = (document.getElementById('v2-email') || {}).value || '';
      var phone = (document.getElementById('v2-phone') || {}).value || '';
      var date = (document.getElementById('v2-date') || {}).value || '';
      var notes = (document.getElementById('v2-notes') || {}).value || '';
      var discreet = (document.getElementById('v2-discreet') || {}).checked;
      var status = document.getElementById('v2-form-status');

      if (!name || !email) {
        if (status) {
          status.hidden = false;
          status.textContent = 'Please enter your name and email address.';
        }
        return;
      }

      var done = window.SLForms ? window.SLForms.busy(form) : function () {};
      var msg = 'Private Showing Request: 3466 Jackson St, San Francisco ($16,250,000). Preferred timing: ' + (date || 'Flexible') + '. ' + (notes ? 'Notes: ' + notes : '') + (discreet ? ' [NDA / Discreet Requested]' : '');

      if (window.SLForms) {
        window.SLForms.post('/api/lead', {
          name: name,
          email: email,
          phone: phone,
          interest: 'buying',
          message: msg,
          source_page: window.location.pathname,
          scene: '3466-jackson-v2'
        }).then(function () {
          if (status) {
            window.SLForms.show(status, 'Thank you, ' + name + '. Steven Lenz Jr. has received your private tour request for 3466 Jackson Street and will contact you directly to coordinate access.', false);
          }
          form.reset();
        }).catch(function (err) {
          if (status) window.SLForms.show(status, err.message, true);
        }).then(done);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initGallery();
      initShowingForm();
    });
  } else {
    initGallery();
    initShowingForm();
  }
})();

