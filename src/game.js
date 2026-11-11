import {initialState,legalMoves,play,positionKey,recordOf,restore,inCheck,describeMove} from './engine.js';
import {BotClient} from './bot-client.js';
export const SAVE='rivergate.game.v1';
export class Game {
  constructor({bot=new BotClient(),storage=null,onChange=()=>{}}={}) {
    this.bot=bot;this.storage=storage;this.onChange=onChange;this.timeline=[initialState()];this.moves=[];this.mode='bot';this.ending=null;this.view=0;this.thinking=false;this.botError='';this.progress=null;this.storageStatus='Ván được lưu trên thiết bị này.';this.notice='Chọn một quân đỏ để bắt đầu.';this.alive=true;this.revision=0;
    try {const raw=storage?.getItem(SAVE);if(raw)this.load(JSON.parse(raw));}
    catch {this.storageStatus='Không đọc được ván lưu. Bắt đầu một ván mới; bạn có thể nhập bản ghi.';}
  }
  get live(){return this.timeline.at(-1);}
  get state(){return this.timeline[this.view];}
  get reviewing(){return !!this.historyMode;}
  get result(){return this.state.result||(!this.reviewing&&this.ending?{winner:this.ending==='draw'?null:this.ending==='red-resign'?'black':'red',reason:this.ending==='draw'?'agreed':'resign'}:null);}
  get humanTurn(){return !this.reviewing&&!this.result&&!this.thinking&&(this.mode==='local'||this.live.turn==='red');}
  load(record) {const parsed=restore(record);Object.assign(this,parsed);this.view=this.moves.length;this.historyMode=false;}
  record(){return recordOf(this.moves,this.mode,this.ending);}
  publish(){if(this.alive)this.onChange(this);}
  save(){try{if(!this.storage)throw Error();this.storage.setItem(SAVE,JSON.stringify(this.record()));this.storageStatus='Đã lưu trên thiết bị này.';}catch{this.storageStatus='Không lưu được trên thiết bị. Hãy xuất bản ghi để giữ ván.';}}
  invalidate(){this.revision++;this.bot.cancel();this.thinking=false;this.progress=null;this.botError='';}
  start(){this.publish();this.ensureBot();}
  commit(move){
    if(!this.humanTurn)return false;
    try{this.append(move);this.ensureBot();return true;}catch{this.notice='Nước này không hợp lệ; tướng phải được bảo vệ.';this.publish();return false;}
  }
  append(move){const next=play(this.live,move);this.notice=describeMove(this.live,move);this.moves.push({from:move.from,to:move.to});this.timeline.push(next);this.view=this.moves.length;this.save();this.publish();}
  ensureBot(){
    if(!this.alive||this.mode!=='bot'||this.reviewing||this.result||this.live.turn!=='black'||this.thinking)return;
    this.thinking=true;this.botError='';this.progress=null;const rev=++this.revision,state=this.live;
    this.publish();
    this.bot.start(state,{budgetMs:800,onProgress:p=>{if(this.alive&&rev===this.revision){this.progress=p;this.publish();}},
      onResult:(result,key)=>{
        if(!this.alive||rev!==this.revision||this.reviewing||this.mode!=='bot'||key!==positionKey(this.live.board,this.live.turn))return;
        this.thinking=false;
        if(!legalMoves(this.live.board,this.live.turn).some(m=>m.from===result.move?.from&&m.to===result.move?.to)){this.failBot();return;}
        this.progress=result;this.append(result.move);
      },onError:()=>{if(this.alive&&rev===this.revision){this.thinking=false;this.failBot();}}});
  }
  failBot(){this.botError='Bot chưa trả được nước đi. Thử lại hoặc chọn Hai người.';this.publish();}
  retry(){this.invalidate();this.ensureBot();}
  undo(){
    if(!this.moves.length)return;
    this.invalidate();let count=this.moves.length-1;
    if(this.mode==='bot'&&this.timeline[count].turn==='black'&&count>0)count--;
    this.moves=this.moves.slice(0,count);this.timeline=this.timeline.slice(0,count+1);this.view=count;this.historyMode=false;this.ending=null;this.notice='Đã lùi nước. Bạn có thể chọn hướng đi khác.';this.save();this.publish();this.ensureBot();
  }
  newGame(){this.invalidate();this.timeline=[initialState()];this.moves=[];this.view=0;this.historyMode=false;this.ending=null;this.notice='Ván mới. Đỏ đi trước.';this.save();this.publish();}
  setMode(mode){if(!['bot','local'].includes(mode)||mode===this.mode)return;this.invalidate();this.mode=mode;this.save();this.publish();this.ensureBot();}
  seek(index){if(!Number.isInteger(index)||index<0||index>this.moves.length)return;this.invalidate();this.view=index;this.historyMode=true;this.publish();}
  returnLive(){this.invalidate();this.view=this.moves.length;this.historyMode=false;this.publish();this.ensureBot();}
  finish(kind){if(this.reviewing||this.result)return;this.invalidate();this.ending=kind==='draw'?'draw':`${this.mode==='bot'?'red':this.live.turn}-resign`;this.save();this.publish();}
  importRecord(text){if(typeof text!=='string'||text.length>100000)throw Error('Bản ghi quá lớn.');const record=JSON.parse(text);restore(record);this.invalidate();this.load(record);this.notice='Đã mở bản ghi. Lịch sử và lượt đi đã được xác minh.';this.save();this.publish();this.ensureBot();}
  dispose(){this.alive=false;this.invalidate();this.bot.dispose();}
}
