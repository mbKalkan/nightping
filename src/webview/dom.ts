export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * A sentence whose `{0}`, `{1}`… are nodes, such as a name in bold; the words stay text. A node
 * named twice is copied, since one node has only one place in the page.
 */
export function fill(template: string, ...nodes: Node[]): Node[] {
  const used = new Set<Node>();
  return template
    .split(/(\{\d+\})/)
    .filter((part) => part !== '')
    .map((part) => {
      const index = /^\{(\d+)\}$/.exec(part)?.[1];
      const node = index !== undefined ? nodes[Number(index)] : undefined;
      if (!node) return document.createTextNode(part);
      if (used.has(node)) return node.cloneNode(true);
      used.add(node);
      return node;
    });
}

export function button(text: string, kind: 'primary' | 'secondary' | 'link'): HTMLButtonElement {
  const node = element('button', `ng-button ng-${kind}`, text);
  node.type = 'button';
  return node;
}
