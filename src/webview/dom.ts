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

/** A sentence whose `{0}`, `{1}`… are nodes, such as a name in bold; the words stay text. */
export function fill(template: string, ...nodes: Node[]): Node[] {
  return template
    .split(/(\{\d+\})/)
    .filter((part) => part !== '')
    .map((part) => {
      const index = /^\{(\d+)\}$/.exec(part)?.[1];
      return (index !== undefined && nodes[Number(index)]) || document.createTextNode(part);
    });
}

export function button(text: string, kind: 'primary' | 'secondary' | 'link'): HTMLButtonElement {
  const node = element('button', `ng-button ng-${kind}`, text);
  node.type = 'button';
  return node;
}
