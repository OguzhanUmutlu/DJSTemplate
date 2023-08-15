import {event} from "../../template.js";

export default event("messageCreate", message => {
    if (message.content === "ping") {
        message.reply("Pong!");
    }
});