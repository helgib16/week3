let _ = require('lodash');

module.exports = function (injected) {
    const generateUUID = injected('generateUUID');
    const commandRouter = injected('commandRouter');
    const eventRouter = injected('eventRouter');
    const eventStore = injected('eventStore');
    const Aggregate = injected('aggregate');

    const Cache = injected('Cache');

    const aggregateCache = Cache();

    const loadLock = {};

    let handleCommand = function (cmd) {

        let aggregate = aggregateCache.get(cmd.gameId);

        if(!aggregate){
            if(loadLock[cmd.gameId]){
                global.setTimeout(()=>{
                    handleCommand(cmd); // Retry after 100 milliseconds.
                }, 100);
                return;
            }
            loadLock[cmd.gameId] = cmd;
            eventStore.loadEvents(cmd.gameId, null, function (eventStream) {
                delete loadLock[cmd.gameId];
                aggregate = Aggregate(eventStream);
                aggregateCache.add(cmd.gameId,aggregate);
                applyCommand();
            });
        } else {
            applyCommand();
        }

        function applyCommand(){
            aggregate.executeCommand(cmd, function (resultingEvents) {
                _.each(resultingEvents, function (event) {
                    event.eventId=generateUUID();
                    event.userSession = cmd._session;
                    event.gameId=cmd.gameId;
                    event.commandId=cmd.commandId;
                    eventRouter.routeMessage(
                        event
                    )
                });
            });
        }
    };

    return {
        startHandling(){
            commandRouter.on('*', function (commandMessage) {
                if(commandMessage.gameId){
                    handleCommand(commandMessage);
                } // else this is not a game command, ignore it
            })
        }
    }
};

