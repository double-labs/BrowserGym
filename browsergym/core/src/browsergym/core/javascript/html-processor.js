/*
We need the original HTML to contain data-attributes for all elements that are typable or clickable, since
it helps the LLM select the right elements, so we use this processor to add it
*/
class HtmlProcessor {
  static idDataAttribute = 'data-twin-unique-id';
  static typeDataAttribute = 'data-twin-agent-element-type';
  static hasClickListenerDataAttribute = 'data-twin-agent-element-has-click-listener';
  static twinAgentIdOverlayCls = 'twin-agent-id-overlay';
  static elementTypes = {
    typable: 'typable',
    clickable: 'clickable',
    selectable: 'selectable',
  };
  #uniqueIdCounter = 0;

  constructor() {}

  static isTypable(element) {
    if (!element) return false;

    const typableInputTypes = [
      'text',
      'textarea',
      'password',
      'email',
      'number',
      'search',
      'url',
      'tel'
    ];

    // Check both instanceof and tagName because the element might be from an iframe
    return (
      element instanceof HTMLTextAreaElement ||
      element.tagName === 'TEXTAREA' ||
      ((element instanceof HTMLInputElement || element.tagName === 'INPUT') &&
        typableInputTypes.includes(element.type)) ||
      element.getAttribute('contenteditable') === 'true'
    );
  }

  static isNotAvailable(element) {
    const style = getComputedStyle(element);
    return (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.pointerEvents === 'none' ||
      element.hasAttribute('disabled')
    );
  }

  static isClickableInput(element) {
    const clickableInputTypes = [
      'submit',
      'button',
      'reset',
      'checkbox',
      'radio',
      'color',
      'range',
      'reset'
    ];
    return element.tagName === 'INPUT' && clickableInputTypes.includes(element.type);
  }

  static isSelectable(element) {
    return element.tagName === 'SELECT';
  }

  static hasClickableEventListeners(element) {
    return element.hasAttribute(HtmlProcessor.hasClickListenerDataAttribute);
  }

  static hasClickableRole(element) {
    const clickableARIARoles = ['button', 'link', 'menuitem', 'tab', 'switch', 'option', 'radio'];
    const role = element.getAttribute('role') || '';
    return clickableARIARoles.includes(role);
  }

  static hasClickableEventAttribute(element) {
    const clickableEventAttributes = ['onclick', 'ondblclick', 'onmousedown'];
    for (const attr of clickableEventAttributes) {
      if (element.hasAttribute(attr)) {
        return true;
      }
    }
    return false;
  }

  static isCommonInteractiveElement(element) {
    const clickableTagNames = ['A', 'BUTTON', 'SELECT', 'SUMMARY', 'OPTION'];
    return clickableTagNames.includes(element.tagName);
  }

  static isFocusable(element) {
    const tabIndex = element.getAttribute('tabIndex');
    return tabIndex != null && tabIndex !== '';
  }

  static isOptionWithinSelect(element) {
    return element.tagName === 'OPTION' && element.parentElement.tagName === 'SELECT';
  }

  static isClickable(element) {
    if (
      !element || 
      this.isNotAvailable(element) || 
      this.isOptionWithinSelect(element) || 
      this.isSelectable(element)
    ) return false;

    return (
      this.hasClickableEventListeners(element) ||
      this.isCommonInteractiveElement(element) ||
      this.hasClickableEventAttribute(element) ||
      this.hasClickableRole(element) ||
      this.isClickableInput(element) ||
      this.isFocusable(element)
    );
  }

  flagInteractable(element) {
    if (HtmlProcessor.isTypable(element)) {
      element.setAttribute(HtmlProcessor.typeDataAttribute, HtmlProcessor.elementTypes.typable);
    } else if (HtmlProcessor.isClickable(element)) {
      element.setAttribute(HtmlProcessor.typeDataAttribute, HtmlProcessor.elementTypes.clickable);
    } else if (HtmlProcessor.isSelectable(element)) {
      element.setAttribute(HtmlProcessor.typeDataAttribute, HtmlProcessor.elementTypes.selectable);
    }
  }

  updateCounter() {
    HtmlProcessor.getAllElements().forEach((e) => {
      if (e.hasAttribute(HtmlProcessor.idDataAttribute)) {
        const idNumber = Number.parseInt(e.getAttribute(HtmlProcessor.idDataAttribute));
        if (!Number.isNaN(idNumber)) {
          this.#uniqueIdCounter = Math.max(this.#uniqueIdCounter, idNumber + 1);
        }
      }
    });
  }

  generateUniqueId() {
    return `${this.#uniqueIdCounter++}`;
  }

  addUniqueId(element) {
    if (element.hasAttribute(HtmlProcessor.idDataAttribute)) {
      return;
    }
    if (HtmlProcessor.isTypable(element)) {
      element.setAttribute(HtmlProcessor.idDataAttribute, `typable-element-${this.generateUniqueId()}`);
    } else if (HtmlProcessor.isClickable(element)) {
      element.setAttribute(HtmlProcessor.idDataAttribute, `clickable-element-${this.generateUniqueId()}`);
    }
  }

  static getAllElements(root = document) {
    const elements = Array.from(root.querySelectorAll('*'));
    elements.forEach(elem => {
      if (elem.shadowRoot) {
        elements.push(...HtmlProcessor.getAllElements(elem.shadowRoot));
      }
    });
    const iframes = root.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        if (iframe.contentDocument != null) {
          const iframeElements = iframe.contentDocument.querySelectorAll('*');
          for (const iframeElement of iframeElements) {
            elements.push(iframeElement);
          }
        }
      } catch {}
    }
    return elements;
  }

  run() {
    HtmlProcessor.getAllElements().forEach((el) => {
      this.flagInteractable(el);
    });
  }

  runAddIds() {
    this.updateCounter();
    HtmlProcessor.getAllElements().forEach((el) => {
      this.addUniqueId(el);
    });
  }

  static isAvailableForInteraction(element) {
    const style = window.getComputedStyle(element);
    
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' 
    ) {
      return false;
    }
    const visibility = element.getAttribute("browsergym_visibility_ratio");
    if (visibility && parseFloat(visibility) < 0.5) {
      return false;
    }
    return true;
  }

  static getElementLabel(elementId) {
    if (elementId.startsWith("clickable-element-")) {
      return "ce-" + elementId.substring("clickable-element-".length);
    }
    else if (elementId.startsWith("typable-element-")) {
      return "te-" + elementId.substring("typable-element-".length);
    } 
    else if (elementId.startsWith("selectable-element-")) {
      return "se-" + elementId.substring("selectable-element-".length);
    }
    return elementId;
  }

  
  static findParentIframe(shadowHosts, selector) {
      const parentIframe = document.body.querySelector(`iframe[data-twin-unique-id="${selector}"]`);
      if (parentIframe) {
          return parentIframe;
      }
      for (const host of shadowHosts) {
        if (host.shadowRoot) {
            const foundIframe = host.shadowRoot.querySelector(`iframe[data-twin-unique-id="${selector}"]`);
            if (foundIframe) {
                return foundIframe; 
            }
        }
      }
      return null; 
  }

  static shadowHosts(){
    return Array.from(document.body.querySelectorAll('*')).filter((el) => el.shadowRoot);
  }

  static extractPrefix(elementId) {
      const regex = /-(\D)(?=\d)/; // Regex to match the character before the number
      const match = elementId.match(regex);
      
      return match ? match[1] : null; // Return the captured group or null if no match
  }

  static addOverlay() {
    const allElements = HtmlProcessor.getAllElements().filter((element) => {
      const id = element.getAttribute(this.idDataAttribute);
      if (!id || id === "*") {
        return false;
      }
      return true;
    });

    const shadowHosts = this.shadowHosts();

    allElements.forEach((element, index) => {
      const elementId = element.getAttribute(this.idDataAttribute);
      const elementType = element.getAttribute(this.typeDataAttribute);

      if (!elementId || !elementType || !this.isAvailableForInteraction(element)) {
        return;
      }

      const fragment = document.createDocumentFragment();

      
      const overlay = document.createElement('div');
      fragment.appendChild(overlay);
      const text = document.createElement('span');
      overlay.appendChild(text);

      const color = '#000000'
      text.innerText = this.getElementLabel(elementId);
      text.style.position = 'absolute';
      text.style.background = color;
      text.style.color = "white";
      text.style.padding = "2px 4px";
      text.style.fontSize = '12px';
      text.style.fontWeight = 'bold';
      text.style.borderRadius = "2px";
      text.style.whiteSpace = 'nowrap';

      const corner = index % 4;
      switch (corner) {
        case 0:
          text.style.top = '0px';
          text.style.borderTop = '1px';
          text.style.left = '0px';
          text.style.borderLeft = '1px';
          break;
        case 1:
          text.style.top = '0px';
          text.style.borderTop = '1px';
          text.style.right = '0px';
          text.style.borderRight = '1px';
          break;
        case 2:
          text.style.bottom = '0px';
          text.style.borderBottom = '1px';
          text.style.left = '0px';
          text.style.borderLeft = '1px';
          break;
        case 3:
          text.style.bottom = '0px';
          text.style.borderBottom = '1px';
          text.style.right = '0px';
          text.style.borderRight = '1px';
          break;
      }

      overlay.classList.add(this.twinAgentIdOverlayCls);
      overlay.style.position = 'fixed';
      overlay.style.textAlign = 'left';
      overlay.style.zIndex = 2147483647;
      overlay.style.overflow = 'visible';
      const rect = element.getBoundingClientRect();
      overlay.style.top = `${rect.top}px`;
      overlay.style.left = `${rect.left}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.maxWidth = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
      overlay.style.outline= `2px dashed ${color}`;
      overlay.style.pointerEvents = "none";
      overlay.style.boxSizing = 'border-box';

      const prefix = this.extractPrefix(elementId);
      if (prefix) {
        const parentIframe = this.findParentIframe(shadowHosts, prefix);
        parentIframe.contentDocument.body.appendChild(fragment);
      } else {
        document.body.appendChild(fragment);
      }
    })
  }

  static getOverlay() {
    const svgNs = 'http://www.w3.org/2000/svg';
    const interactiveTags = [
      'a',
      'button',
      'input',
      'textarea',
      'select',
      'details',
      'label',
      'option',
      'summary',
      'div'
    ];
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
    svg.setAttribute('data-device-pixel-ratio', `${window.devicePixelRatio}`);
    svg.setAttribute(
      'data-screen',
      JSON.stringify({
        width: window.screen.width,
        height: window.screen.height,
        availWidth: window.screen.availWidth,
        availHeight: window.screen.availHeight
      })
    );
    function createOverlayElement(boundingRect, elementId, elementType) {
      const g = document.createElementNS(svgNs, 'g');
      const rect = document.createElementNS(svgNs, 'rect');
      g.appendChild(rect);
      g.setAttribute('transform', `translate(${boundingRect.left}, ${boundingRect.top})`);
      g.setAttribute(HtmlProcessor.idDataAttribute, elementId);
      g.setAttribute(HtmlProcessor.typeDataAttribute, elementType);
      rect.setAttribute('width', `${boundingRect.width}`);
      rect.setAttribute('height', `${boundingRect.height}`);
      rect.setAttribute('fill', 'none');
      rect.setAttribute('stroke', 'red');
      rect.setAttribute('stroke-width', '2');
      return { g, rect };
    }
    for (const tag of interactiveTags) {
      const elements = Array.from(document.getElementsByTagName(tag));
      for (const element of elements) {
        const elementId = element.getAttribute(this.idDataAttribute);
        const elementType = element.getAttribute(this.typeDataAttribute);
        if (!elementId || !elementType || !this.isVisibleByTheUser(element)) {
          continue;
        }
        const boundingRect = element.getBoundingClientRect();
        const absBoundingRect = {
          top: boundingRect.top + window.scrollY,
          left: boundingRect.left + window.scrollX,
          width: boundingRect.width,
          height: boundingRect.height
        };
        const { g } = createOverlayElement(absBoundingRect, elementId, elementType);
        svg.appendChild(g);
      }
    }
    const serializer = new window.XMLSerializer();
    return serializer.serializeToString(svg);
  }

  static removeOverlay() {
    document.querySelectorAll(`.${this.twinAgentIdOverlayCls}`).forEach((el) => el.remove());

    const shadowHosts = this.shadowHosts(); 
    for (const host of shadowHosts) { 
        const overlayElements = host.shadowRoot.querySelectorAll(`.${this.twinAgentIdOverlayCls}`);
        overlayElements.forEach((el) => el.remove()); 
        
        const iframesInShadow = host.shadowRoot.querySelectorAll('iframe');
        for (const iframe of iframesInShadow) {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                if (iframeDoc) {
                    iframeDoc.querySelectorAll(`.${this.twinAgentIdOverlayCls}`).forEach((el) => el.remove());
                }
            } catch (error) {
                console.warn(`Cannot access iframe content in shadow DOM due to CORS policy: ${error}`);
            }
        }
    }

    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            if (iframeDoc) {
                iframeDoc.querySelectorAll(`.${this.twinAgentIdOverlayCls}`).forEach((el) => el.remove());
            }
        } catch (error) {
            console.warn(`Cannot access iframe content due to CORS policy: ${error}`);
        }
    }
}
}


window.HtmlProcessor = HtmlProcessor;
