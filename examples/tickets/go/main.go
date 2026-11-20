// A ticket endpoint in Go (standard library): POST /ticket {"room": "..."} -> {"ticket": "...", "expiresAt": ...}.
//
//	JSFLOW_SECRET_KEY=sk_... JSFLOW_KEY_ID=key_... JSFLOW_APP=myapp go run .
//
// The secret key lives only on your server (an environment variable or your secrets store), never in a page.
// `go run . mint < input.json` prints a ticket for {secretKey, keyId, app, room, sub, region?, ttlSeconds?, iat?}.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"
)

// REPLACE THIS with your own authentication: return the signed-in user's id, or "". The ticket makes jsflow trust this
// id (peers read it with room.user(peerId)), so it must come from your session, never from the request body.
func currentUser(r *http.Request) string { return r.Header.Get("X-Demo-User") }

func main() {
	if len(os.Args) > 1 && os.Args[1] == "mint" {
		var p Params
		if err := json.NewDecoder(os.Stdin).Decode(&p); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		t, err := MintTicket(p)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		fmt.Println(t)
		return
	}
	secret, keyID, app := os.Getenv("JSFLOW_SECRET_KEY"), os.Getenv("JSFLOW_KEY_ID"), os.Getenv("JSFLOW_APP")
	if secret == "" || keyID == "" || app == "" {
		log.Fatal("set JSFLOW_SECRET_KEY, JSFLOW_KEY_ID and JSFLOW_APP")
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8787"
	}
	send := func(w http.ResponseWriter, status int, body any) {
		w.Header().Set("content-type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(body)
	}
	http.HandleFunc("/ticket", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			send(w, 404, map[string]string{"err": "not_found"})
			return
		}
		sub := currentUser(r)
		if sub == "" {
			send(w, 401, map[string]string{"err": "unauthorized"})
			return
		}
		var in struct {
			Room string `json:"room"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&in); err != nil {
			send(w, 400, map[string]string{"err": "bad_json"})
			return
		}
		// Decide here whether this user may enter this room. The ticket is your yes.
		t, err := MintTicket(Params{SecretKey: secret, KeyID: keyID, App: app, Room: in.Room, Sub: sub, TTLSeconds: 300})
		if err != nil {
			send(w, 400, map[string]string{"err": "bad_request", "message": err.Error()})
			return
		}
		send(w, 200, map[string]any{"ticket": t, "expiresAt": time.Now().Add(5 * time.Minute).UnixMilli()})
	})
	log.Printf("ticket endpoint on http://127.0.0.1:%s/ticket", port)
	log.Fatal(http.ListenAndServe("127.0.0.1:"+port, nil))
}
