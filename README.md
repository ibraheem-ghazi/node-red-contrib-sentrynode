## NodeRed Sentry Node

provides a custom node for node-red that wrap Sentry.io API for sending captured errors to your sentry project.

Send any captured error from node-red to Sentry by connecting it to catch node

**Properties**

`DSN`: the project dsn from sentry.io

`Environment`: which environment should be attached to error sent

**Per node configurations**

the node will search for `msg.sentry` if found, any supported config will be set.

**Supported `msg.sentry` configurations**

*   user: {id, username, email, ip_address}

**How it works?**

if `msg` object includes errors `msg.error` it will be used and sent to sentry, if also contains `msg._error` it will be added as breadcrumb for the error sent.

**Return**

the node will return a payload of type object having a node `sent` which mean there is valid errors captured and sent to sentry or not.
note: true does mean successful sent to Sentry (as it may fail due to invalid dsn for example) but it mean that this node captured the error, parsed it, and executed `Sentry.captureException`

## Contributors
<img src = "https://contrib.rocks/image?repo=ibraheem-ghazi/node-red-contrib-sentrynode"/>
Made with contrib.rocks
