import type { Directive } from "vue";

type RevealElement = HTMLElement & {
  motionRevealObserver?: IntersectionObserver;
};

export const motionReveal: Directive<RevealElement> = {
  mounted(element) {
    element.classList.add("motion-reveal");

    if (!window.IntersectionObserver || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      element.classList.add("motion-reveal--visible");
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      element.classList.add("motion-reveal--visible");
      observer.disconnect();
      delete element.motionRevealObserver;
    }, { threshold: 0.12, rootMargin: "0px 0px -7%" });

    element.motionRevealObserver = observer;
    observer.observe(element);
  },
  unmounted(element) {
    element.motionRevealObserver?.disconnect();
    delete element.motionRevealObserver;
  },
};
