const functions = require('firebase-functions');
const admin = require('firebase-admin');
const {
  WebhookClient
} = require('dialogflow-fulfillment');
const { SessionsClient } = require('dialogflow');
const cors = require('cors')({origin:true});

//import serviceAccount = require('../');

const serviceAccount = require('../service-account.json');
admin.initializeApp({credential: admin.credential.cert(serviceAccount), // credential: admin.credential.applicationDefault(),  credential: admin.credential.cert(serviceAccount)
databaseURL: "https://saga-1f81f-default-rtdb.europe-west1.firebasedatabase.app"});



  exports.dialogflowFirebaseFulfillment = functions.region('europe-west6').https.onRequest((request:any, response:any) => {
    const agent = new WebhookClient({
      request,
      response
    });
    //console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
  // console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

  // const result = request.body.queryResult;
  //console.log(agent);
  const userId = request.body.session.slice(-28);
  console.log("userID " + userId);
  const hoy = new Date();

  async function ReservarActividad(agent:any) {

    let parametrosReserva = agent.parameters;
    const db = admin.database();
    const slotFilling = request.body.queryResult.parameters;
    console.log(slotFilling);
    console.log(parametrosReserva);
    console.log("slot " + JSON.stringify(slotFilling));
    let {
      actividad,
      dia,
      hora
    } = slotFilling;
    let disponibles:any = null;

    console.log(`actividad ${actividad[0]}`);
    ///////////////////////
    //Comprobar datos en la BD para ver si ya tiene una reserva
    const pathUserReservation = `users/${userId}/Reserva/`;
    let reservation ={"day":"","hour":"","type":""};
    const userReservations = db.ref(pathUserReservation);
    await userReservations.once('value').then((snapshot:any) => {
      reservation = snapshot.val();
      console.log("RES: " + JSON.stringify(reservation));
    }).catch(function (error:Error) {
      console.error(error);
    });
    //Si el usuario tiene una reserva, creamos una fecha con el dia para poder compararlo
    let diaReservado = null;
    if (reservation) {
      console.log(' reservation ' + (reservation));
      diaReservado = new Date(reservation.day);
      console.log(diaReservado);
    }

    //Comparamos la fecha de la reserva existente, si es igual o posterior a hoy, pedimos al usuario que la anule manualmente, si es anteior a hoy, continuamos
    if (diaReservado && (diaReservado.getDate() >= hoy.getDate())) {
      agent.add(`Tiene una reserva para jugar al ${reservation.type}, el día ${reservation.day} a las ${reservation.hour}. Si desea hacer otra reserva debe anular esta primero en el apartado "Reserva"`);
    } else if (!actividad[0]) {
      agent.add(`Que actividad desea reservar, ¿tenis o pádel?`);
    } else if (!dia[0]) {
      agent.add(`¿para que dia desea reservar? Estamos de lunes a domingo`);
    } else if (!hora) { // Do backend stuff here
      //Formateo de la fecha que proporciona DialogFlow
      dia = dia[0].toString().replace(/T/, ' ').substr(0, 10);

      //Comprobar datos en la BD"actividad":["tenis"],"dia":["2021-03-08T12:00:00+01:00"],"hora":["2021-03-09T00:00:00+01:00"]
      const pathActividad = `actividad/${actividad[0]}/${dia}`;
      disponibles = [];
      let planificadas = null;
      let lista = db.ref(pathActividad);
      await lista.once('value').then((snapshot:any) => {

        planificadas = snapshot.val();
        //   console.log(planificadas)

        //Si las horas planificadas tienen valor libre, guardo su key en disponibles
        for (let x in planificadas) {
          if (planificadas[x] == 'libre') {
            disponibles.push(x);
          }
        }
        console.log(' disponible ' + disponibles);


      }).catch(function (error:Error) {
        console.error(error);
      });
      if (disponibles.length > 0) {
        agent.add("Para ese día tenemos huecos disponibles a las " + disponibles.toString() + " horas \n ¿A que hora de estas le interesa? (Especifique am si es por la mañana o pm si es por la tarde)");
      } else {
        agent.add(`No hay horas disponibles para el dia  ${dia}. Escriba un número cualquiera para volver a empezar`);
      }
      //A partir de aquí ya existe hora en el slot
    } else {
      let diaInput = new Date(dia[0]);
      console.log("hoy es el " + hoy.getDate(), "el usuario ha puesto el dia  " + diaInput.getDate())
      if (hoy.getDate() > diaInput.getDate()) {
        agent.add("Ese día y hora ya han pasado.Intentalo de nuevo ");
      } else {

        dia = dia[0].toString().replace(/T/, ' ').substr(0, 10);
        console.log(dia);
        hora = hora.toString().replace(/T/, ' ').substr(11, 5);
        console.log('hora ' + hora); //hora que entiende dialogflow
        const pathHora = `actividad/${actividad[0]}/${dia}/${hora}`;

        let listaHora = db.ref(pathHora);
        let horaDisponible;
        await listaHora.once('value').then((snapshot:any) => {
           horaDisponible = snapshot.val();
        })
        if (horaDisponible == "libre") {
          //actualizar user en DB
          const path = 'users/' + userId + '/Reserva';
          const u = {
            type: actividad[0],
            day: dia,
            hour: hora
          }
          const ref = db.ref(path);
          await ref.set(u)
            .catch((error:Error) => console.log(error));

          //asignar hora planificada al usuario
          await listaHora.set(userId)
            .catch((error:Error) => console.log(error));


          agent.add(`Su reserva ${actividad[0]}, dia ${dia}, a las ${hora}h se ha guardado!`);
        } else {
          agent.add('Esa hora no está disponible');
        }
      }
    }
  }


  let intentMap = new Map();
  intentMap.set('ReservarActividad', ReservarActividad);
  agent.handleRequest(intentMap);
});




exports.dialogflowGateway = functions.region('europe-west6').https.onRequest((request:any, response:any) => {
  
  //Cors en functions https://cloud.google.com/functions/docs/writing/http?hl=es

  response.set('Access-Control-Allow-Origin', '*');

  if (request.method === 'OPTIONS') {
    // Send response to OPTIONS requests
    response.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    response.set('Access-Control-Allow-Headers', 'Authorization, X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Allow-Request-Method');
    response.set('Allow', 'GET, POST, OPTIONS, PUT, DELETE');
  } 

    cors(request, response, async () => {

    const { queryInput, sessionId } = request.body;
    const sessionClient= new SessionsClient({credentials: serviceAccount});
    const session = sessionClient.sessionPath('saga-1f81f', sessionId);
    let result;
    try {
    const responses =  await sessionClient.detectIntent ({ session, queryInput});

     result = responses[0].queryResult;
   } catch (error) {
    result = error;
   }
  console.log(result);
    response.send(result);


    })
});
