import test from "tape";
import {
    getLocation,
} from "./api.js";

test("can get a value from the offscreen document", async (t) => {
  t.equal(await getLocation(), "offscreen.html");
});
