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
			scope.setTag("handled", false)
			scope.setExtra("source.id", err.source.id)
			scope.setExtra("source.name", err.source.name)
			scope.setExtra("source.type", err.source.type)
			scope.setExtra("source.count", err.source.count)
			scope.setExtra("source", JSON.stringify(err.source))
			if(typeof callback === 'function'){
				let errObject = new Error(message);
				errObject.stack = `source node: ${tag_source_node}`; //override the stack so sentry group it by source node.
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
					  msgConfig.user.username && (user.id = msgConfig.user.username);
					  msgConfig.user.email && (user.id = msgConfig.user.email);
					  msgConfig.user.ip_address && (user.id = msgConfig.user.ip_address);
					  
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