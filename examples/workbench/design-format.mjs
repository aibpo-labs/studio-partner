import MarkdownIt from 'markdown-it';
// Model output is untrusted: no HTML, remote images, or unsafe link schemes.
const markdown = new MarkdownIt({html:false,linkify:false,breaks:true}).disable('image');
const originalLink = markdown.renderer.rules.link_open || ((tokens,index,options,env,self)=>self.renderToken(tokens,index,options));
markdown.renderer.rules.link_open = (tokens,index,options,env,self)=>{
  tokens[index].attrSet('rel','noopener noreferrer');
  return originalLink(tokens,index,options,env,self);
};
export function redactDesignText(value) {
  return String(value??'').replace(/\bsk-[A-Za-z0-9_*.-]{8,}/g,'[Key 已隐藏]');
}
export function renderDesignMarkdown(value) {
  return markdown.render(redactDesignText(value));
}
