const Sentry = require('@sentry/node');

module.exports = function(RED) {

	/**
	* validate {input} is a valid object with and not empty
	* @param {object} input
	**/
	function isValidObject(input){
		return typeof input === 'object'
			&& input !== null
			&& Object.keys(input).length>0;
	}
	
	/**
	* validate {err} is a valid node red error object
	* @param {object} err
	**/
	function isValidErrorObject(err){
		return typeof err === 'object' && typeof err.message === 'string' && typeof err.source === 'object'
	}
	
	/**
	* try to get the details of the node using it's {node_id}
	* @param {string} node_id
	* return null on fail, or object with fixed structure.
	**/
	function getNodeDetails(node_id){
		const nodeInfo = RED.nodes.getNode(node_id);
		if(!nodeInfo) return null;
		return {
			"id": nodeInfo.id,
			"type": nodeInfo.type,
			"name": nodeInfo.name,
			"func": nodeInfo.func,
			"flow":{
				"id": nodeInfo.z
			}
		}
	}
	
	/**
	* build the error stack trace, that describe the error location regarding the
	* Node-Red flows UI not the internal code, that can be displayed as backtrace
	* breadcrumbs later on sentry.
	* @param {string} error_message the error message contained in the err object.
	* @param {string} node_id the node id that causing the error.
	* return a string represent valid stack trace for exceptions.
	**/
	function buildErrorStackFrames(error_message, node_id){
		let matches = error_message.match(/line (\d+), col (\d+)/mi);
		let line = matches[1] || 0;
		let pos = matches[2] || 0;
		
		const node_info = getNodeDetails(node_id);
		
		let error_line = '';
		try{ error_line = node_info.func.split("\n")[line-1]; }catch(e){}
		
		return `Error: ${error_message}
			at "${error_line}" (node/${node_info.id}:${line}:${pos})
			at @node(${node_info.type}:${node_info.name}) (flows/${node_info.flow.id}/nodes/${node_info.id}:${line}:${pos})
			at @flow (flows/${node_info.flow.id}:0:0)
		`;
	}
	
	/**
	* convert node red error object to native error and prepare it's data to be sent to Sentry
	* @param {object} err node-red error object
	* @param {function} callback with {err} parameter represent native js Error, any Sentry call (ex: captureException) will be scoped with more data inside it.
	**/
	function wrapError(err, callback){
		
		
		Sentry.withScope(scope => {
			let message = String(err.message);
			let errType = message.match(/^(\w+Error)\:\s/);
			if(Array.isArray(errType)){
				errType = errType[1];
				message = message.replace(/^(\w+Error)\:\s/,'');
			}else{
				errType = null;
			}
			
			let tag_source_node = `${err.source.id} `;
			err.source.name && (tag_source_node = `(${err.source.name})`);
			
			errType && scope.setTag("error_type", errType)
			scope.setTag("source_node", tag_source_node)
			//no matter what changed the value the Sentry will always tag the exception as handled:yes
			scope.setTag("handled", 'no')
			scope.setExtra("source.id", err.source.id)
			scope.setExtra("source.name", err.source.name)
			scope.setExtra("source.type", err.source.type)
			scope.setExtra("source.count", err.source.count)
			scope.setExtra("node_info", JSON.stringify(getNodeDetails(err.source.id), null,2))

			if(typeof callback === 'function'){
				let errObject = new Error(message);
				errObject.stack = buildErrorStackFrames(err.message, err.source.id);
				errObject.data = err;
				callback(errObject);
			}
		});
	}
	
	/**
	* custom node-red {Sentry} definition
	**/
    function SentryNode(config) {	
        RED.nodes.createNode(this, config);
        var node = this;
		
		/**
		* init the sentry only on deployment
		*/
        Sentry.init({ dsn: config.dsn, environment: config.environment || 'debug' });
        
		node.on('input', function(msg, send, done) {
			
			//set configuration throw the payload
			if(isValidObject(msg.sentry)){
				let msgConfig = msg.sentry;
				if(isValidObject(msgConfig.user)){
					Sentry.configureScope(function(scope) {
					  const user = {};
					  msgConfig.user.id && (user.id = msgConfig.user.id);
					  msgConfig.user.username && (user.username = msgConfig.user.username);
					  msgConfig.user.email && (user.email = msgConfig.user.email);
					  msgConfig.user.ip_address && (user.ip_address = msgConfig.user.ip_address);
					  
					  scope.setUser(user);
					});
				}
			}
			
			//check for errors in msg object and send it to sentry
			let errorSent = false;//nothing sent
			try{
				if(isValidErrorObject(msg.error)){
					if(isValidErrorObject(msg._error)){
						wrapError(msg.error, err=>Sentry.addBreadcrumb({
						  category: 'previous_error',
						  message: err,
						  type:'error',
						  level: Sentry.Severity.Error
						}));
					}
					wrapError(msg.error, err=>Sentry.captureException(err));
					errorSent = true;//sent
				}
			}catch(err){
				node.error(err);
			}
			msg.payload = {sent:errorSent};
            node.send(msg);
        });
    }
    RED.nodes.registerType("sentry", SentryNode);
}