/** Offline visual fixture. Uses real widgets with synthetic messages, no model or credentials. */
import { ProcessTerminal, ScrollView, matchesKey, isKeyRelease } from '@earendil-works/pi-tui';
import { WarningSafeTui } from '../lib/terminal/warning-screen.js';
import { TranscriptModel } from '../lib/transcript.js';
import { TranscriptView } from '../lib/ui/view.js';
import { MarkdownRenderer } from '../lib/ui/markdown.js';
import { BoxedEditor } from '../lib/ui/editor.js';
import { PromptBar } from '../lib/ui/prompt.js';
import { StatusBar } from '../lib/ui/status.js';
import { surfaceLayout } from '../lib/ui/layout.js';
import { createTheme } from '../lib/theme.js';
import { toolDisplayTable, toolDisplayFor } from '../lib/tool-display.js';
import { cardOfCall, cardOfResult } from '../lib/cards/presenter.js';
import { contentLines } from '../lib/cards.js';
const terminal = new ProcessTerminal(), tui = new WarningSafeTui(terminal), theme = createTheme('truecolor');
const presenter = {
  call: (name, raw) => cardOfCall({card:'terminal', title:JSON.parse(raw).command}, name),
  result: (name, input) => cardOfResult({card:'terminal', output:contentLines(input.content).join('\n'), exitCode:input.isError ? 1 : 0}, {name,failed:input.isError,contentLines:contentLines(input.content)}),
};
const model = new TranscriptModel(presenter), state = {expandCards:false,expandReasoning:false,expandSubCalls:false};
const tools=toolDisplayTable({default:{collapsed:true,output:'hidden'},bash:{output:'tail',tail:3}});
model.apply({type:'user/message',data:{content:[{type:'text',text:'检查项目的测试结果。'}],source:{kind:'user'}}});
model.apply({type:'tool/call',data:{name:'bash',arguments:JSON.stringify({command:'pnpm test'}),callId:'preview1'}});
model.apply({type:'tool/result',data:{message:{content:[{type:'tool-result',toolCallId:'preview1',text:'Starting checks\nLoading fixtures\nTest Files  135 passed (135)\nTests       2173 passed (2173)\nDuration    16.65s'}],isError:false}}});
model.apply({type:'assistant/message',data:{message:{content:[{type:'text',text:'测试全部通过。命令和结果会留在对话中，展开详情可查看保留的输出。'}]}}});
model.apply({type:'tool/call',data:{name:'bash',arguments:JSON.stringify({command:'missing-command'}),callId:'preview2'}});
model.apply({type:'tool/result',data:{message:{content:[{type:'tool-result',toolCallId:'preview2',text:'command not found'}],isError:true}}});
const view = new TranscriptView(model,theme,new MarkdownRenderer(theme.markdown),{presentation:'codex',state:()=>state,toolDisplay:name=>toolDisplayFor(tools,name)});
const editor=new BoxedEditor(tui,theme.editor), empty={render:()=>[],invalidate:()=>{}};
const status=new StatusBar(()=>({activity:'idle',cwd:process.cwd(),model:'deepseek-v4-pro'}),theme);
tui.setLayoutRoot(surfaceLayout({transcript:new ScrollView(view,{follow:'end',primary:true,overscroll:'chain'}),dock:empty,queue:empty,prompt:new PromptBar(editor),status},()=>1));
tui.setFocus(editor);
tui.addInputListener(data=>{
  if(isKeyRelease(data)) return undefined;
  if(matchesKey(data,'ctrl+c')){tui.stop();process.exit(0)}
  if((matchesKey(data,'ctrl+shift+o')||matchesKey(data,'ctrl+alt+o'))){state.expandCards=!state.expandCards;tui.requestImmediateRender();return {consume:true}}
});
tui.start();
