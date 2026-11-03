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

export function button(text: string, kind: 'primary' | 'secondary' | 'link'): HTMLButtonElement {
  const node = element('button', `ng-button ng-${kind}`, text);
  node.type = 'button';
  return node;
}
