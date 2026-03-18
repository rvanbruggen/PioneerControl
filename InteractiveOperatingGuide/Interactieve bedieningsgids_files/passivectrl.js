//<![CDATA[
//jqery1.5Œn
var sRT=1000;
var hysT=3000;
var sRf=3000;
function sendStatusRequest(iA)
{
var bRet=true;
jQuery.support.cors=true;
var rS="http://"+iA+"/StatusHandler.asp";
if(bRet)
{
$.ajax(
{
url:rS,
dataType:"text",
async:false,
cache:false,
success:function(data,textStatus,XMLHttpRequest)
{
htmlCtrl(data);
},
error:function(XMLHttpRequest,textStatus,errorThrown)
{
bRet = false;
},
complete:function(XMLHttpRequest,textStatus)
{      
},
beforeSend:function(XHttpReqObject)
{
XHttpReqObject.setRequestHeader("If-Modified-Since", "Thu, 01 Jun 1970 00:00:00 GMT");
}
});	
}
return bRet;
}
//]]>