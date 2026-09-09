// Conservative intraprocedural rule: inspect every async function, including
// named listeners and on* assignments. Branches join with OR; nested functions
// do not lend their awaits to the enclosing function. No event-name allowlist.
// Dynamic property names and event reads hidden inside called helpers require
// review; this is a source lint, not interprocedural lifetime analysis.
import {importAuditPackage} from './audit-dependencies.mjs';
const {parse}=await importAuditPackage('acorn');
const isFunction=n=>/^(?:FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(n?.type);
const children=n=>Object.entries(n).flatMap(([key,value])=>
  key==='loc'?[]:Array.isArray(value)?value.filter(x=>x?.type):value?.type?[value]:[]);
const property=n=>n.computed?(n.property.type==='Literal'?n.property.value:null):n.property.name;

export function scanAfterAwaitEvents(source) {
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module',locations:true});
  const hazards=[],reads=[],functions=[],listeners=new Set(),named=new Map(),registrations=[];
  function collect(n) {
    if(isFunction(n)&&n.async)functions.push(n);
    if(n.type==='FunctionDeclaration')named.set(n.id.name,n);
    if(n.type==='VariableDeclarator'&&isFunction(n.init))named.set(n.id.name,n.init);
    if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&property(n.callee)==='addEventListener')registrations.push(n.arguments[1]);
    if(n.type==='AssignmentExpression'&&n.left.type==='MemberExpression'&&/^on/.test(property(n.left)))registrations.push(n.right);
    for(const child of children(n))collect(child);
  }
  collect(ast);
  for(const ref of registrations)listeners.add(ref?.type==='Identifier'?named.get(ref.name):ref);
  for(const fn of functions) {
    // First parameter is the event in listeners. These reads are a review
    // inventory, not failures: target and ordinary Event data survive dispatch.
    const aliases=new Set(fn.params[0]?.type==='Identifier'?[fn.params[0].name]:[]);
    function collectAliases(n) {
      if(isFunction(n))return;
      if(n.type==='VariableDeclarator'&&n.id.type==='Identifier'&&n.init?.type==='Identifier'&&aliases.has(n.init.name))aliases.add(n.id.name);
      for(const child of children(n))collectAliases(child);
    }
    collectAliases(fn.body);
    const add=(list,n,kind)=>{
      if(!list.some(row=>row.offset===n.start&&row.kind===kind))list.push({line:n.loc.start.line,offset:n.start,listenerLine:fn.loc.start.line,kind,code:source.slice(n.start,n.end)});
    };
    function visit(n,suspended) {
      if(!n)return suspended;
      if(isFunction(n)) {
        // A closure created after suspension cannot recover currentTarget.
        if(suspended)inspectDeferred(n);
        return suspended;
      }
      if(n.type==='AwaitExpression') { visit(n.argument,suspended);return true; }
      if(n.type==='IfStatement'||n.type==='ConditionalExpression') {
        const state=visit(n.test,suspended);
        const yes=visit(n.consequent,state),no=visit(n.alternate,state);
        return yes||no;
      }
      if(['ForStatement','ForOfStatement','ForInStatement','WhileStatement','DoWhileStatement'].includes(n.type)) {
        // Inspect a second iteration too: a read before an await in a loop is
        // still after suspension on the next trip around that loop.
        let state=suspended||!!n.await;
        for(const child of children(n))state=visit(child,state);
        if(state&&!suspended)for(const child of children(n))visit(child,true);
        return state;
      }
      if(n.type==='MemberExpression') {
        suspended=visit(n.object,suspended);
        if(n.computed)suspended=visit(n.property,suspended);
        if(suspended)inspectRead(n);
        return suspended;
      }
      if(n.type==='VariableDeclarator') {
        suspended=visit(n.init,suspended);
        if(suspended&&n.id.type==='ObjectPattern')inspectPattern(n.id,n.init);
        return visit(n.id,suspended);
      }
      if(n.type==='AssignmentExpression'&&n.left.type==='ObjectPattern') {
        suspended=visit(n.right,suspended);
        if(suspended)inspectPattern(n.left,n.right);
        return suspended;
      }
      for(const child of children(n))suspended=visit(child,suspended);
      return suspended;
    }
    function inspectRead(n) {
      const prop=property(n);
      if(prop==='currentTarget')add(hazards,n,'currentTarget');
      if(listeners.has(fn)&&n.object.type==='Identifier'&&aliases.has(n.object.name))add(reads,n,String(prop??'[dynamic]'));
    }
    function inspectPattern(pattern,value) {
      for(const p of pattern.properties) {
        if(p.type!=='Property')continue;
        const key=p.computed?p.key.value:(p.key.name??p.key.value);
        if(key==='currentTarget')add(hazards,p,'currentTarget');
        if(listeners.has(fn)&&value?.type==='Identifier'&&aliases.has(value.name))add(reads,p,String(key));
      }
    }
    function inspectDeferred(n) {
      if(isFunction(n)&&n.params.some(p=>p.type==='Identifier'&&aliases.has(p.name)))return;
      if(n.type==='MemberExpression'&&n.object.type==='Identifier'&&aliases.has(n.object.name))inspectRead(n);
      if(n.type==='VariableDeclarator'&&n.id.type==='ObjectPattern'&&n.init?.type==='Identifier'&&aliases.has(n.init.name))inspectPattern(n.id,n.init);
      for(const child of children(n))inspectDeferred(child);
    }
    visit(fn.body,false);
  }
  return {hazards:hazards.sort((a,b)=>a.offset-b.offset),reads:reads.sort((a,b)=>a.offset-b.offset),asyncFunctions:functions.length};
}
