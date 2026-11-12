import {build} from 'esbuild';
await build({entryPoints:[new URL('../examples/workbench/design-format.mjs',import.meta.url).pathname],outfile:new URL('../examples/workbench/design-format.js',import.meta.url).pathname,bundle:true,format:'iife',globalName:'DesignFormat',platform:'browser',minify:true,legalComments:'eof'});
