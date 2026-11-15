'use strict';

/**
 * site/js/area-map.js
 * High-performance Dark-Gold Interactive Explorer Map for City Guides.
 * Uses Leaflet with CartoDB Dark Matter tiles and custom illuminated gold SVG pins.
 */

(function () {
  function initAreaMap() {
    var mapEl = document.getElementById('area-interactive-map');
    if (!mapEl) return;

    // Load Leaflet locally if not already present
    if (typeof L === 'undefined') {
      if (!document.getElementById('leaflet-css')) {
        var link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = '/vendor/leaflet/leaflet.css';
        document.head.appendChild(link);
      }
      var script = document.createElement('script');
      script.src = '/vendor/leaflet/leaflet.js';
      script.onload = function () {
        renderMap(mapEl);
      };
      script.onerror = function () {
        console.error('Failed to load local Leaflet script');
      };
      document.head.appendChild(script);
    } else {
      renderMap(mapEl);
    }
  }

  function renderMap(mapEl) {
    if (mapEl._leaflet_id) return; // Prevent double-initialization

    var rawCenter = mapEl.getAttribute('data-center') || '37.6624,-121.8747';
    var centerParts = rawCenter.split(',').map(function (n) { return parseFloat(n.trim()); });
    var zoom = parseInt(mapEl.getAttribute('data-zoom') || '13', 10);

    var rawDataEl = document.getElementById('area-map-data');
    if (!rawDataEl) return;

    var landmarks = [];
    try {
      landmarks = JSON.parse(rawDataEl.textContent || '[]');
    } catch (e) {
      console.warn('Could not parse area map data', e);
      return;
    }

    var map = L.map('area-interactive-map', {
      center: centerParts,
      zoom: zoom,
      scrollWheelZoom: false,
      zoomControl: true
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(map);

    setTimeout(function () {
      map.invalidateSize();
    }, 200);

    window.addEventListener('resize', function () {
      map.invalidateSize();
    });

    // Custom Gold Marker Icons
    function createIcon(category, number) {
      var iconSymbol = '✦';
      if (category === 'schools') iconSymbol = '🎓';
      else if (category === 'enclaves') iconSymbol = '🏡';
      else if (category === 'dining') iconSymbol = '🍷';
      else if (category === 'parks') iconSymbol = '🌲';

      return L.divIcon({
        className: 'sl-map-marker-wrap',
        html: '<div class="sl-map-pin" data-cat="' + category + '">' +
                '<span class="sl-map-pin__icon">' + iconSymbol + '</span>' +
                '<span class="sl-map-pin__pulse"></span>' +
              '</div>',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18]
      });
    }

    var markerLayerGroup = L.layerGroup().addTo(map);
    var allMarkers = [];

    landmarks.forEach(function (lm, idx) {
      var icon = createIcon(lm.category, idx + 1);
      var marker = L.marker([lm.lat, lm.lng], { icon: icon });

      var badgeClass = 'badge--' + (lm.category || 'general');
      var popupContent =
        '<div class="sl-map-popup">' +
          '<span class="sl-map-popup__tag">' + (lm.tag || lm.category.toUpperCase()) + '</span>' +
          '<h4 class="sl-map-popup__title">' + lm.title + '</h4>' +
          '<p class="sl-map-popup__desc">' + lm.desc + '</p>' +
          (lm.highlight ? '<div class="sl-map-popup__hl">★ ' + lm.highlight + '</div>' : '') +
        '</div>';

      marker.bindPopup(popupContent, {
        className: 'sl-custom-popup',
        maxWidth: 280
      });

      marker.category = lm.category;
      marker.landmarkData = lm;
      allMarkers.push(marker);
      markerLayerGroup.addLayer(marker);
    });

    // Category Filter Buttons
    var filterBtns = document.querySelectorAll('[data-map-filter]');
    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        filterBtns.forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        var cat = btn.getAttribute('data-map-filter');

        markerLayerGroup.clearLayers();
        var bounds = [];
        allMarkers.forEach(function (m) {
          if (cat === 'all' || m.category === cat) {
            markerLayerGroup.addLayer(m);
            bounds.push(m.getLatLng());
          }
        });

        // Filter sidebar list if present
        var listItems = document.querySelectorAll('[data-landmark-item]');
        listItems.forEach(function (item) {
          var itemCat = item.getAttribute('data-category');
          if (cat === 'all' || itemCat === cat) {
            item.style.display = 'flex';
          } else {
            item.style.display = 'none';
          }
        });

        if (bounds.length) {
          map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 14 });
        }
      });
    });

    // Sidebar landmark item click -> pan to marker & open popup
    var listItems = document.querySelectorAll('[data-landmark-item]');
    listItems.forEach(function (item, idx) {
      item.addEventListener('click', function () {
        listItems.forEach(function (it) { it.classList.remove('is-active'); });
        item.classList.add('is-active');
        var marker = allMarkers[idx];
        if (marker) {
          map.flyTo(marker.getLatLng(), 15, { duration: 1.2 });
          marker.openPopup();
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAreaMap);
  } else {
    initAreaMap();
  }
})();

