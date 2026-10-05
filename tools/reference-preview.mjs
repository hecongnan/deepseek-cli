/** Offline visual fixture using the shipped widgets and synthetic conversation. No model requests. */
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { ProcessTerminal, ScrollView, matchesKey, isKeyRelease } from '@earendil-works/pi-tui';
import { WarningSafeTui } from '../lib/terminal/warning-screen.js';
import { TranscriptModel } from '../lib/transcript.js';
import { TranscriptView } from '../lib/ui/view.js';
import { MarkdownRenderer } from '../lib/ui/markdown.js';
import { BoxedEditor } from '../lib/ui/editor.js';
import { PromptBar } from '../lib/ui/prompt.js';
import { StatusBar } from '../lib/ui/status.js';
import { SelectionPanel } from '../lib/ui/selection-panel.js';
import { ModelPicker } from '../lib/ui/picker.js';
import { defaultKeymap } from '../lib/input/actions.js';
import { surfaceLayout } from '../lib/ui/layout.js';
import { createTheme } from '../lib/theme.js';
import { parseSettings, toOverrides } from '../lib/theme-settings.js';
const terminal = new ProcessTerminal(), tui = new WarningSafeTui(terminal);
const config = readFileSync(new URL('../examples/cordis.patch.yml', import.meta.url),'utf8').split('\n').filter(line=>!line.includes('!!js')).join('\n');
const settings = parseSettings(load(config)[0].config);
const blue = load(readFileSync(new URL('../themes/deepseek-blue.yaml',import.meta.url),'utf8'));
const theme = createTheme('truecolor',toOverrides(settings,{get:()=>blue}));
const keys = defaultKeymap();
const model = new TranscriptModel();
model.apply({type:'user/message',data:{content:[{type:'text',text:'你现在是什么模型？'}],source:{kind:'user'}}});
model.apply({type:'assistant/message',data:{message:{content:[
  {type:'reasoning',text:'用户正在询问当前模型。应根据当前路由直接回答。\n这行在展开思考时可见。'},
  {type:'text',text:'我现在使用 **DeepSeek V4 Flash**。有什么我可以帮你的吗？'}
]}}});
const facts=()=>({activity:'idle',cwd:process.cwd(),model:'deepseek-v4-flash',effort:'high',contextTokens:12400,contextWindow:128000,inputTokens:10300,outputTokens:3100,cacheRate:0.87});
const state={expandCards:false,expandReasoning:false,expandSubCalls:false};
const view = new TranscriptView(model,theme,new MarkdownRenderer(theme.markdown),{presentation:'codex',welcome:facts,state:()=>state});
const editor = new BoxedEditor(tui,theme.editor,()=>keys,undefined,text=>text,line=>theme.style('transcript.assistant.border',line));
const empty={render:()=>[],invalidate:()=>{}};
const routes=[{provider:'deepseek',model:'deepseek-v4-flash',name:'DeepSeek V4 Flash'},{provider:'deepseek',model:'deepseek-v4-pro',name:'DeepSeek V4 Pro'}];
let picker;
const open=()=>{picker=new ModelPicker(()=>routes,()=>({provider:'deepseek',model:'deepseek-v4-flash',reasoningEffort:'high'}),()=>keys);editor.disableSubmit=true;tui.setFocus(null);tui.requestRender()};
const close=()=>{picker=undefined;editor.disableSubmit=false;tui.setFocus(editor);tui.requestRender()};
tui.setLayoutRoot(surfaceLayout({transcript:new ScrollView(view,{follow:'end',primary:true,overscroll:'chain'}),dock:empty,queue:empty,prompt:new PromptBar(editor),controls:new SelectionPanel(()=>picker?.card(8),theme),promptMinRows:3,status:new StatusBar(facts,theme)},()=>1));
tui.setFocus(editor);
tui.addInputListener(data=>{
  if(isKeyRelease(data))return undefined;
  if(matchesKey(data,'ctrl+c')){tui.stop();process.exit(0)}
  if(picker){if(picker.handleKey(data))close();else tui.requestRender();return {consume:true}}
  if(matchesKey(data,'ctrl+shift+p') || matchesKey(data,'ctrl+p')){open();return {consume:true}}
  if(matchesKey(data,'shift+tab')){state.expandReasoning=!state.expandReasoning;tui.requestRender();return {consume:true}}
});
editor.onSubmit=text=>{if(text==='/model'){editor.setText('');open()}};
tui.start();
