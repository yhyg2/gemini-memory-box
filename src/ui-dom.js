function createUI(doc){
  const SVG='http://www.w3.org/2000/svg';
  const svgNames={viewbox:'viewBox',preserveaspectratio:'preserveAspectRatio'};
  function create(node,inSVG=false){
    if(typeof node==='string')return doc.createTextNode(node);
    const [tag,attrs,children]=node,svg=inSVG||tag==='svg';
    const element=svg?doc.createElementNS(SVG,tag):doc.createElement(tag);
    for(const [name,value]of Object.entries(attrs))element.setAttribute(svg?(svgNames[name]||name):name,value);
    for(const child of children)element.appendChild(create(child,svg));
    return element;
  }
  const fragment=doc.createDocumentFragment();
  for(const node of UI_TREE)fragment.appendChild(create(node));
  return fragment;
}
