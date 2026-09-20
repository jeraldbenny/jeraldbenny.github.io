/**
 * Smart Visitor & Click Stream Telemetry Tracker
 * Privacy-friendly, cookieless, zero PII, smart bot/crawler filtering.
 */
(function() {
  'use strict';

  // Fallback / default Google Apps Script Web App endpoint
  var DEFAULT_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwuAYhDnph3cRrdCs-SfE-EnhlWLjNR8xuw_F-QOitWjU8vB697TCl9qtFwARo4ZYpchg/exec';

  function getWebhookUrl() {
    try {
      return localStorage.getItem('digiplay_webhook_url') || DEFAULT_WEBHOOK_URL;
    } catch(e) {
      return DEFAULT_WEBHOOK_URL;
    }
  }

  // 1. Smart Bot & Crawler Detection
  function isBot() {
    try {
      // Check automated headless browser flags
      if (navigator.webdriver) return true;
      if (window.document.documentElement.getAttribute('webdriver')) return true;
      if (window.callPhantom || window._phantom) return true;

      // Check user-agent signatures
      var ua = (navigator.userAgent || '').toLowerCase();
      var botTokens = [
        'bot', 'spider', 'crawler', 'headless', 'lighthouse',
        'semrush', 'ahrefs', 'bytespider', 'yandex', 'baidu',
        'slurp', 'mediapartners', 'feedfetcher', 'preview'
      ];
      for (var i = 0; i < botTokens.length; i++) {
        if (ua.indexOf(botTokens[i]) !== -1) return true;
      }
    } catch(e) {}
    return false;
  }

  // Generate or retrieve persistent anonymous session ID (scoped to current browser tab session)
  function getSessionId() {
    try {
      var sid = sessionStorage.getItem('jb_trk_sid');
      if (!sid) {
        sid = 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
        sessionStorage.setItem('jb_trk_sid', sid);
      }
      return sid;
    } catch(e) {
      return 's_' + Date.now().toString(36);
    }
  }

  function getDeviceType() {
    var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
    if (!isMobile) return 'Desktop';
    return (window.innerWidth >= 768) ? 'Tablet' : 'Mobile';
  }

  function getCleanReferrer() {
    try {
      var ref = document.referrer || '';
      if (!ref) return 'Direct';
      var refUrl = new URL(ref);
      if (refUrl.hostname === window.location.hostname) return 'Internal';
      return refUrl.hostname.replace('www.', '');
    } catch(e) {
      return document.referrer ? 'External' : 'Direct';
    }
  }

  // Dispatch event payload
  function dispatchEvent(eventData) {
    if (isBot()) return;

    var endpoint = getWebhookUrl();
    if (!endpoint) return;

    var nowIso = new Date().toISOString().replace('T', ' ').substring(0, 19);
    var payload = {
      type: 'traffic',
      timestamp: nowIso,
      event: eventData.event || 'pageview',
      page: eventData.page || window.location.pathname || '/',
      label: eventData.label || document.title || 'Page View',
      referrer: getCleanReferrer(),
      device: getDeviceType(),
      screen: window.innerWidth + 'x' + window.innerHeight,
      language: navigator.language || 'en',
      sessionId: getSessionId()
    };

    var jsonString = JSON.stringify(payload);

    // Try sendBeacon first for reliability during page unload/clicks
    if (navigator.sendBeacon) {
      try {
        var blob = new Blob([jsonString], { type: 'text/plain;charset=UTF-8' });
        var queued = navigator.sendBeacon(endpoint, blob);
        if (queued) return;
      } catch(e) {}
    }

    // Fallback to fetch with no-cors
    try {
      fetch(endpoint, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: jsonString
      }).catch(function() {});
    } catch(e) {}
  }

  // 2. Human Interaction Engagement Trigger for Pageview
  var pageviewDispatched = false;
  function triggerHumanPageview() {
    if (pageviewDispatched) return;
    pageviewDispatched = true;

    // Detach interaction listeners once verified human
    window.removeEventListener('mousemove', onFirstInteraction);
    window.removeEventListener('scroll', onFirstInteraction);
    window.removeEventListener('touchstart', onFirstInteraction);
    window.removeEventListener('keydown', onFirstInteraction);
    window.removeEventListener('click', onFirstInteraction);

    // Deduplicate pageview within the same browser session for identical URL path
    var pathKey = 'jb_pv_' + (window.location.pathname || '/');
    try {
      if (sessionStorage.getItem(pathKey)) {
        return; // Already logged this page for this session
      }
      sessionStorage.setItem(pathKey, '1');
    } catch(e) {}

    dispatchEvent({
      event: 'pageview',
      page: window.location.pathname || '/',
      label: document.title || 'Page View'
    });
  }

  var moveCount = 0;
  function onFirstInteraction(e) {
    if (e.type === 'mousemove') {
      moveCount++;
      if (moveCount < 3) return; // Ignore micro jitter
    }
    triggerHumanPageview();
  }

  // Set up interaction listeners
  window.addEventListener('mousemove', onFirstInteraction, { passive: true });
  window.addEventListener('scroll', onFirstInteraction, { passive: true });
  window.addEventListener('touchstart', onFirstInteraction, { passive: true });
  window.addEventListener('keydown', onFirstInteraction, { passive: true });
  window.addEventListener('click', onFirstInteraction, { passive: true });

  // Fallback trigger after 4.5s if user stays on page reading (indicates real user reading content)
  setTimeout(function() {
    if (!pageviewDispatched && !document.hidden && !isBot()) {
      triggerHumanPageview();
    }
  }, 4500);

  // 3. Automated Click & Download Tracking
  document.addEventListener('click', function(e) {
    var target = e.target;
    var el = target.closest('a, button, [data-track]');
    if (!el) return;

    var label = el.getAttribute('data-track') || '';
    var href = el.getAttribute('href') || '';
    var text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');

    if (!label) {
      if (href) {
        if (href.indexOf('.pdf') !== -1 || href.indexOf('Resume') !== -1) {
          label = 'Download Resume (' + (href.split('/').pop() || 'PDF') + ')';
        } else if (href.indexOf('linkedin.com') !== -1) {
          label = 'External: LinkedIn Profile';
        } else if (href.indexOf('github.com') !== -1) {
          label = 'External: GitHub Profile';
        } else if (href.indexOf('mailto:') === 0) {
          label = 'Contact: Email Click (' + href.replace('mailto:', '') + ')';
        } else if (href.indexOf('digifeed') !== -1) {
          label = 'Launch: DigiFeed';
        } else if (href.indexOf('digiplay') !== -1) {
          label = 'Launch: DigiPlay';
        } else if (href.indexOf('digilab') !== -1) {
          label = 'Launch: DigiLab';
        } else if (href.indexOf('http') === 0 && href.indexOf(window.location.hostname) === -1) {
          label = 'External Link: ' + (el.title || text.substring(0, 30) || href);
        } else if (text) {
          label = 'Navigation: ' + text.substring(0, 30);
        }
      } else if (text) {
        label = 'Button: ' + text.substring(0, 30);
      }
    }

    if (label) {
      dispatchEvent({
        event: 'click',
        page: window.location.pathname || '/',
        label: label
      });
    }
  }, true);

  // Global helper for manual custom event dispatching
  window.jbTrackEvent = function(label, category) {
    dispatchEvent({
      event: category || 'click',
      page: window.location.pathname || '/',
      label: label
    });
  };

})();
