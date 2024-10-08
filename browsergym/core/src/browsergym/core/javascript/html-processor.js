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
    return true;
  }

  static getElementLabel(elementId) {
    if (elementId.startsWith("clickable-element-")) {
      return "ce-" + elementId.substring("clickable-element-".length);
    }
    if (elementId.startsWith("typable-element-")) {
      return "te-" + elementId.substring("typable-element-".length);
    }
    return elementId;
  }

  static addOverlay() {
    const colorArray = [
      ['#87CEEB', '#000080'],
      ['#F5FFFA', '#228B22'],
      ['#FFDAB9', '#8B4513'],
      ['#FFFACD', '#B8860B'],
      ['#E0FFFF', '#2F4F4F'],
      ['#FFC0CB', '#8B0000'],
      ['#FFFFE0', '#808000'],
      ['#F0E68C', '#556B2F'],
      ['#E6E6FA', '#483D8B'],
      ['#F0FFF0', '#008000']
    ];
    let colorIndex = 0;

    const allElements = HtmlProcessor.getAllElements();

    for (const element of allElements) {
      const elementId = element.getAttribute(this.idDataAttribute);
      const elementType = element.getAttribute(this.typeDataAttribute);

      if (!elementId || !elementType || !this.isAvailableForInteraction(element)) {
        continue;
      }

      const colors = colorArray[colorIndex++ % colorArray.length];
      const fragment = document.createDocumentFragment();
      const overlay = document.createElement('div');
      fragment.appendChild(overlay);
      const text = document.createElement('span');
      overlay.appendChild(text);

      text.innerText = this.getElementLabel(elementId);
      text.style.position = 'absolute';
      text.style.background = colors[0];
      text.style.color = colors[1];
      text.style.fontSize = '9px';
      text.style.fontWeight = 'bold';
      text.style.padding = '0px';
      text.style.whiteSpace = 'nowrap';
      text.style.border = colors[1];

      const corner = Math.floor(Math.random() * 4);
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
      overlay.style.position = 'absolute';
      overlay.style.textAlign = 'left';
      overlay.style.zIndex = '100000000';
      overlay.style.overflow = 'visible';
      const rect = element.getBoundingClientRect();
      const offset = 2;
      overlay.style.top = `${rect.top + window.scrollY + offset / 2}px`;
      overlay.style.left = `${rect.left + window.scrollX + offset / 2}px`;
      overlay.style.width = `${rect.width - offset}px`;
      overlay.style.maxWidth = `${rect.width - offset}px`;
      overlay.style.height = `${rect.height - offset}px`;
      overlay.style.border = `1px solid ${colors[1]}`;
      overlay.style.boxSizing = 'border-box';

      document.body.appendChild(fragment);
    }
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
  }
}

window.HtmlProcessor = HtmlProcessor;
