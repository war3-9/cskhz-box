// Native Human HUD assets and FDF dimensions; Warcraft coordinates are 0.8 x 0.6.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { decodeBLP, getBLPImageData } = require('war3-model');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'src/ui-replacement/assets');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function main() {
  const resourceDefinition = fs.readFileSync(path.join(output, 'native/ResourceBar.fdf'), 'utf8');
  const upperDefinition = fs.readFileSync(path.join(output, 'native/UpperButtonBar.fdf'), 'utf8');
  const commandDefinition = fs.readFileSync(path.join(output, 'native/CommandFunc.txt'), 'utf8');
  const commandPosition = id => {
    const section = new RegExp(`\\[${id}\\]([\\s\\S]*?)(?:\\[|$)`).exec(commandDefinition)[1];
    return /Buttonpos=(\d+),(\d+)/i.exec(section).slice(1).map(Number);
  };
  const template = /Texture "ResourceBarIconTemplate"\s*\{([^}]+)\}/.exec(resourceDefinition)[1];
  const button = /Frame "SIMPLEBUTTON" "UpperButtonBarButtonTemplate"\s*\{([^}]+)\}/.exec(upperDefinition)[1];
  const number = (text, key) => Number(new RegExp(`${key}\\s+([\\d.]+)`).exec(text)[1]);
  const frame = /Frame "SIMPLEFRAME" "ResourceBarFrame"\s*\{([\s\S]+)/.exec(resourceDefinition)[1];
  const resourceX = (0.8 - number(frame, 'Width')) * 2400;
  const iconWidth = number(template, 'Width') * 2400, iconHeight = number(template, 'Height') * 1800;
  const specs = [
    { id:'human-console-buttonstates2', name:'左上四个按钮', archivePath:'UI\\Widgets\\Console\\Human\\human-console-buttonstates2.blp',
      x:0.002*2400, y:0.003125*1800, width:number(button,'Width')*2400*4, height:number(button,'Height')*1800,
      regions:Array.from({length:4},(_,i)=>({x:i*number(button,'Width')*2400,y:0,width:number(button,'Width')*2400,height:number(button,'Height')*1800,u:0,v:0,uw:0.6640625,vh:0.171875})) },
    { id:'ResourceGold',name:'金币图标',archivePath:'UI\\Feedback\\Resources\\ResourceGold.blp',x:resourceX,y:0.003125*1800,width:iconWidth,height:iconHeight },
    { id:'ResourceLumber',name:'木材图标',archivePath:'UI\\Feedback\\Resources\\ResourceLumber.blp',x:resourceX+0.0859375*2400,y:0.003125*1800,width:iconWidth,height:iconHeight },
    ...['str','agi','int'].map((attribute,index)=>({ id:`infocard-heroattributes-${attribute}`,name:['力量图标','敏捷图标','智力图标'][index],
      archivePath:`UI\\Widgets\\Console\\Human\\infocard-heroattributes-${attribute}.blp`,x:1080,y:888+index*61.2,width:76.8,height:57.6 })),
    { id:'human-healthbar-fill',name:'生命显示',archivePath:'UI\\Feedback\\HPBarConsole\\human-healthbar-fill.blp',x:518.4,y:1029.6,width:180,height:18 },
    { id:'human-manabar-fill',name:'法力显示',archivePath:'UI\\Feedback\\ManaBarConsole\\human-manabar-fill.blp',x:518.4,y:1056.6,width:180,height:18 },
    ...[['BTNMove','移动','CmdMove'],['BTNStop','停止','CmdStop'],['BTNHoldPosition','保持位置','CmdHoldPos'],['BTNAttack','攻击','CmdAttack']].map(([id,name,command])=>{
      const [column,row]=commandPosition(command);
      return {id,name,archivePath:`ReplaceableTextures\\CommandButtons\\${id}.blp`,x:1480.8+column*104.4,y:840.6+row*81,width:93.6,height:70.2};
    }),
  ];
  const layers=[];
  for(const spec of specs) {
    const bytes=fs.readFileSync(path.join(root,'素材/人族原生控制台',...spec.archivePath.split('\\')));
    const model=decodeBLP(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    const pixels=getBLPImageData(model,0);
    const decoded = sharp(Buffer.from(pixels.data),{raw:{width:pixels.width,height:pixels.height,channels:4}});
    // Warcraft tints the grayscale health fill green at full health.
    if(spec.id === 'human-healthbar-fill') decoded.tint('#25c653');
    await decoded.png().toFile(path.join(output,`${spec.id}.png`));
    layers.push({...spec,textureWidth:pixels.width,textureHeight:pixels.height,archive:'war3.mpq',sha256:hash(bytes),
      regions:spec.regions||[{x:0,y:0,width:spec.width,height:spec.height,u:0,v:0,uw:1,vh:1}]});
  }
  const definitions=['ResourceBar.fdf','UpperButtonBar.fdf'].map(file=>({file,archive:'War3Patch.mpq',sha256:hash(fs.readFileSync(path.join(output,'native',file)))}));
  definitions.push({file:'CommandFunc.txt',archive:'war3.mpq',sha256:hash(fs.readFileSync(path.join(output,'native/CommandFunc.txt')))});
  const texts = Array.from({length:4},(_,i)=>({id:['quests','menu','allies','chat'][i],text:['任务 (F9)','菜单 (F10)','盟友 (F11)','聊天 (F12)'][i],
    x:specs[0].x+i*specs[0].width/4,y:specs[0].y,width:specs[0].width/4,height:specs[0].height}));
  // The strings' right anchors and height come from ResourceBar.fdf.
  for(const [id,right] of [['gold',0.26484375],['lumber',0.178125]]) texts.push({id,text:'0',x:resourceX+(number(frame,'Width')-right)*2400-116,y:0.003125*1800,width:116,height:iconHeight});
  const result={definitions,layers,texts};
  fs.writeFileSync(path.join(output,'hud-layout.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({assets:layers.map(item=>({id:item.id,width:item.textureWidth,height:item.textureHeight})),definitions:definitions.length}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
