/*
    WebGL 8x8 board games
    Copyright (C) 2011 by Jordi Mariné Fort

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

var LOCAL_USER  = 1;
var REMOTE_USER = 2;
var ENGINE = 3;

var app = app || {};
app.controller = app.controller || {};

app.controller.LocalPlayer = (function() {

  function LocalPlayer(playerNumber) { 
    this.playerNumber = playerNumber;
    return this; 
  }

  LocalPlayer.prototype.constructor.name = "LocalPlayer";

  LocalPlayer.prototype.sendCommand = function(game, player, cmd, args) {
    switch(cmd) {
        case 'LOAD':
            if( this.loadConfirmed || confirm("Play opponent's new game?") ) {
                this.loadConfirmed = false;
                app.view.UI.setGameState(args.data);
                return true;
            } else {
                args.returnValue = false;
                return false;
            }
            break;

        case 'STATE':
            if(player != game.getTurn()) break;

        case 'MOVED':
            app.view.board.acceptHumanMove(true);
            break;

	case 'RETRACT':
            if( this.retractConfirmed || confirm("Retract move?") ) {
                this.retractConfirmed = false;
                app.view.UI.setGameState(args.data);
                return true;
            } else {
                args.returnValue = false;
                return false;
            }
            break;

	case 'DRAW':
            if(confirm("Accept draw offer?") ) {
                return true;
            } else {
                return false;
            }
            break;

    }
  }

  return LocalPlayer;
})();


app.controller.EnginePlayer = (function() {

  function EnginePlayer(playerNumber) { 
    this.playerNumber = playerNumber;
    return this; 
  }

  EnginePlayer.prototype.constructor.name = "EnginePlayer";

  EnginePlayer.prototype.sendCommand = function(game, player, cmd, args) {
   switch(cmd) {
       case 'LOAD':
       case 'STATE':
           if(player != game.getTurn()) break;

       case 'MOVED': 
           var alg = $('select[id=algorithm_name] > option:selected').val();
           var level = $('input[id=level]').val();

           console.log("The computer is thinking...");

           //DEBUG: locks user interface, but it is easiest to debug than webworker code
           //var move = getBestMove(game, alg, level);
           //alert("Best: " + move);
           //game.initFromStateStr(game.toString());
           //alert("Done");
           //END DEBUG

           app.controller.Players.runEnginePlayer({ alg: alg, level:level, game: game.toString()});
           console.log("AI Engine: move requested");
           break;

       case 'RETRACT':
           if( this.retractConfirmed || confirm("Retract move?") ) {
                this.retractConfirmed = false;
                app.view.UI.setGameState(args.data);
                return true;
           } else {
                args.returnValue = false;
                return false;
           }
           break;

	case 'DRAW':
            if(confirm("Accept draw offer?") ) {
                return true;
            } else {
                return false;
            }
            break;

    }
  
  }

  return EnginePlayer;
})();



app.controller.NetworkPlayer = (function() {

  function NetworkPlayer(playerNumber) { 
    this.playerNumber = playerNumber;
    this.retractConfirmed = false;
    return this; 
  }

  NetworkPlayer.prototype.constructor.name = "NetworkPlayer";

  NetworkPlayer.prototype.sendCommand = function(game, player, cmd, args) {
    switch(cmd) {
        case 'LOAD':
            if(!this.loadConfirmed) {
               var state = args;
               app.view.UI.showMessage("Waiting load confirmation from " + app.lobby.getOpponentNick());
               app.lobby.sendLoadRequest(game, state, player);
               args.returnValue = false;
            } else {
               this.loadConfirmed = false;
               app.view.UI.setGameState(args.data);
               return true;
            }
            return false;
            break;

	case 'MOVE':
            try {
                var move = args;
                app.lobby.sendMoveRequest(game, move, this.playerNumber);
            } catch(e) {
                alert(e.message);
            }
            break;

        case 'MOVED':
            if(!game.isOver() && player == game.getTurn()) {
                var opponent = app.lobby.getOpponentNick();
                if(opponent) app.view.UI.showMessage("Waiting move from " + opponent);
            } else {
                //app.view.UI.showMessage("");
            }
            break;

        case 'STATE':
            if(!game.isOver() && player == game.getTurn()) {
                var opponent = app.lobby.getOpponentNick();
                if(opponent) app.view.UI.showMessage("Waiting move from " + opponent);
            }
            break;

	case 'RETRACT':
            // send question to opponent
            if(!this.retractConfirmed) {
                var state = args.data;
                app.view.UI.showMessage("Waiting retract confirmation from " + app.lobby.getOpponentNick());
                app.lobby.sendRetractMoveRequest(game, state, player);
                args.returnValue = false;
            } else {
                this.retractConfirmed = false;
                app.view.UI.setGameState(args.data);
                return true;
            }
            return false;
            break;

	case 'DRAW':
            // send question to opponent
            app.view.UI.showMessage("Waiting draw confirmation from " + app.lobby.getOpponentNick());
            return false;
            break;

    }
  }

  return NetworkPlayer;
})();



app.controller.Players = {

  worker: null,
  players : Array(),

  getPlayer: function(playerNumber) {
      return this.players[playerNumber];
  },

  createPlayer: function(playerNumber) {
    var retval = null;
    var playerType = $('select[id=player'+playerNumber+'] > option:selected').attr('value');

    if( (playerType == REMOTE_USER) && (!app.lobby.isConnected()) ) {
        playerType = LOCAL_USER;
    }

    switch(parseInt(playerType)) {
        case LOCAL_USER:
            retval = new app.controller.LocalPlayer(playerNumber);
            break;
        case REMOTE_USER:
            retval = new app.controller.NetworkPlayer(playerNumber);
            break;
        case ENGINE:
            retval = new app.controller.EnginePlayer(playerNumber);
            break;
    }

    this.players[playerNumber] = retval;
    return retval;
  },


  runEnginePlayer: function(args) {
    if(!this.worker) {
        this.worker = new Worker("ai-worker.js");

        this.worker.onmessage = function(event) {
            var moveStr = event.data;
            console.log("AI Engine: move received: " + moveStr);

            if(moveStr == "null") {
                app.view.board.checkGameStatus();
            } else {
                var move = game.parseMoveString(moveStr);
                app.view.board.movePieceOnBoard(move);
            }
        };
    }

    this.worker.postMessage(args);
  },


  stopEnginePlayer: function() {
    if(this.worker) {
        this.worker.terminate(); 
        this.worker = null;
    }
  }


};

