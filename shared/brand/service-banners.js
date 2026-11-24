/* Small, reciprocal service links shared by all three settings screens. */
(() => {
  'use strict';
  if (customElements.get('ojjuda-service-banners')) return;
  const services = {
    agit: {
      name: '아지트', caption: '모임·게임', href: '/world.html?tab=hub',
      image: '/features/home/theme-illustrations/classic.webp', width: 960, height: 640,
      label: '아지트, 모임과 게임 즐기기'
    },
    park: {
      name: '공원', caption: '일상·소통', href: '/park/',
      image: '/features/home/park-community-3d-20261119.webp',
      label: '공원, 일상 이야기 둘러보기'
    },
    pajang: {
      name: '파장', caption: '19+ 소개팅', href: '/features/pajang/',
      image: '/features/home/pajang-signal-3d-20261119.webp',
      label: '파장, 19세 이상 회원 소개팅, 오늘의 질문 보기'
    }
  };

  class ServiceBanners extends HTMLElement {
    static get observedAttributes() { return ['current']; }
    connectedCallback() { this.render(); }
    attributeChangedCallback() { if (this.isConnected) this.render(); }
    render() {
      const current = this.getAttribute('current');
      if (!Object.hasOwn(services, current)) { this.replaceChildren(); return; }
      const nav = document.createElement('nav');
      nav.className = 'ojjuda-service-banners';
      nav.setAttribute('aria-label', '다른 오쭈다 서비스');
      for (const [id, service] of Object.entries(services)) {
        if (id === current) continue;
        const link = document.createElement('a');
        link.className = 'ojjuda-service-banner';
        link.dataset.service = id;
        link.href = service.href;
        link.target = '_top';
        link.setAttribute('aria-label', service.label);
        if (id === 'pajang') link.setAttribute('data-pajang-launch', '');
        const copy = document.createElement('span');
        copy.className = 'ojjuda-service-banner-copy';
        const title = document.createElement('strong');
        title.textContent = service.name;
        const caption = document.createElement('small');
        caption.textContent = service.caption;
        const arrow = document.createElement('span');
        arrow.className = 'ojjuda-service-banner-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '→';
        copy.append(title, caption, arrow);
        const art = document.createElement('img');
        art.className = 'ojjuda-service-banner-art';
        art.src = service.image;
        art.alt = '';
        art.width = service.width || 768;
        art.height = service.height || 768;
        art.loading = 'lazy';
        art.decoding = 'async';
        link.append(copy, art);
        nav.append(link);
      }
      const footer = document.createElement('div');
      footer.className = 'ojjuda-test-service-footer';
      const testLink = document.createElement('a');
      testLink.className = 'ojjuda-test-service-link';
      testLink.href = '/avatar-test/';
      testLink.target = '_top';
      testLink.textContent = 'Test service';
      testLink.setAttribute('aria-label', 'Test service · 아바타 테스트');
      footer.append(testLink);
      this.replaceChildren(nav, footer);
    }
  }
  customElements.define('ojjuda-service-banners', ServiceBanners);
})();
