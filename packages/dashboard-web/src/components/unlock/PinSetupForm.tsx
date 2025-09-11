import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { api } from "../../api";

export function PinSetupForm() {
    const [pin, setPin] = useState("");

    const handleSetPin = async () => {
        try {
            // await api.setPin("user1", pin); // TODO: implement this API method
            console.log("Setting PIN:", pin);
            // TODO: show success notification
        } catch (error) {
            // TODO: show error notification
        }
    };

    return (
        <div className="grid gap-4">
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="pin" className="text-right">
                    PIN
                </Label>
                <Input
                    id="pin"
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    className="col-span-3"
                />
            </div>
            <Button onClick={handleSetPin}>Set PIN</Button>
        </div>
    );
}
