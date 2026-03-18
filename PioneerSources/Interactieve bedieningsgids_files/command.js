//<![CDATA[
//jqery1.5Œn
var XPfact=[
function(){return new XMLHttpRequest()},
function(){return new ActiveXObject("Msxml3.XMLHTTP")},
function(){return new ActiveXObject("Msxml2.XMLHTTP")},
function(){return new ActiveXObject("Microsoft.XMLHTTP")}
];
function creXPo(){
var xho=false;
for(var i=0;i<XPfact.length;i++){
try{
xho=XPfact[i]();
}
catch(e){
continue;
}
break;
}
return xho;
}
function sendRequest(rD,iA)
{
var bRet=false;
var rU="http://"+iA+"/EventHandler.asp";
var rC="WebToHostItem="+rD;
var md="POST";
var req=creXPo();
if(req){
req.open(md,rU,false);
req.setRequestHeader("If-Modified-Since","Thu, 1 Jan 1970 00:00:00 GMT");
req.setRequestHeader("Pragma","no-cache");
req.setRequestHeader("Cache-Control","no-cache");                          
req.setRequestHeader("Connection","keep-alive") 
req.send(rC);	
if (req.readyState==4 && req.status==200){
var bRet = true;
}
}
return bRet;
}
//]]>
