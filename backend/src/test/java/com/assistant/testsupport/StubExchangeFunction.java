package com.assistant.testsupport;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.reactive.MockClientHttpRequest;
import org.springframework.web.reactive.function.client.ClientRequest;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.ExchangeFunction;
import org.springframework.web.reactive.function.client.ExchangeStrategies;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.util.UriComponentsBuilder;
import reactor.core.publisher.Mono;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.function.Function;

/**
 * In-memory replacement for the HTTP layer of a {@link WebClient}.
 *
 * The services under test hardcode their upstream URLs (googleapis.com, api.openai.com,
 * api.telegram.org, the WhatsApp bridge), so instead of pointing them at a local server we
 * plug this function into the WebClient: every request is recorded (method, URI, headers and
 * the serialized body) and answered from a queue of canned responses, or by a fallback.
 */
public class StubExchangeFunction implements ExchangeFunction {

    /** A request as it would have gone over the wire. */
    public record RecordedRequest(HttpMethod method, URI uri, HttpHeaders headers, String body) {
        /** Single decoded query parameter value, or {@code null}. */
        public String queryParam(String name) {
            String raw = UriComponentsBuilder.fromUri(uri).build(true).getQueryParams().getFirst(name);
            return raw == null ? null : URLDecoder.decode(raw, StandardCharsets.UTF_8);
        }

        /** Number of distinct query parameters on the URI. */
        public int queryParamCount() {
            return UriComponentsBuilder.fromUri(uri).build(true).getQueryParams().size();
        }
    }

    private final List<RecordedRequest> requests = new ArrayList<>();
    private final Deque<Function<ClientRequest, Mono<ClientResponse>>> queue = new ArrayDeque<>();
    private Function<ClientRequest, Mono<ClientResponse>> fallback =
            request -> Mono.error(new IllegalStateException("No stubbed response for " + request.method() + " " + request.url()));

    // ── configuring responses ──────────────────────────────────────────────

    public StubExchangeFunction enqueueJson(String json) {
        return enqueue(HttpStatus.OK, json);
    }

    public StubExchangeFunction enqueue(HttpStatus status, String json) {
        queue.add(request -> Mono.just(json(status, json)));
        return this;
    }

    public StubExchangeFunction enqueue(Function<ClientRequest, Mono<ClientResponse>> responder) {
        queue.add(responder);
        return this;
    }

    public StubExchangeFunction enqueueError(Throwable error) {
        queue.add(request -> Mono.error(error));
        return this;
    }

    /** Answer used once the queue is empty (default: fail the request). */
    public StubExchangeFunction otherwise(Function<ClientRequest, Mono<ClientResponse>> responder) {
        this.fallback = responder;
        return this;
    }

    public StubExchangeFunction otherwiseJson(String json) {
        return otherwise(request -> Mono.just(json(HttpStatus.OK, json)));
    }

    public static ClientResponse json(HttpStatus status, String json) {
        ClientResponse.Builder builder = ClientResponse.create(status, ExchangeStrategies.withDefaults());
        if (json != null) {
            builder.header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE).body(json);
        }
        return builder.build();
    }

    // ── wiring ─────────────────────────────────────────────────────────────

    public WebClient webClient() {
        return WebClient.builder().exchangeFunction(this).build();
    }

    public WebClient.Builder webClientBuilder() {
        return WebClient.builder().exchangeFunction(this);
    }

    /** Forget recorded requests and queued responses (for stubs shared by a Spring context). */
    public void reset() {
        synchronized (requests) {
            requests.clear();
        }
        queue.clear();
        fallback = request -> Mono.error(new IllegalStateException("No stubbed response for " + request.method() + " " + request.url()));
    }

    // ── inspection ─────────────────────────────────────────────────────────

    public List<RecordedRequest> requests() {
        return requests;
    }

    public RecordedRequest lastRequest() {
        if (requests.isEmpty()) {
            throw new AssertionError("No request was sent");
        }
        return requests.get(requests.size() - 1);
    }

    // ── ExchangeFunction ───────────────────────────────────────────────────

    @Override
    public Mono<ClientResponse> exchange(ClientRequest request) {
        MockClientHttpRequest wire = new MockClientHttpRequest(request.method(), request.url());
        String body = request.writeTo(wire, ExchangeStrategies.withDefaults())
                .then(Mono.defer(() -> wire.getBodyAsString().defaultIfEmpty("")))
                .block();
        HttpHeaders headers = new HttpHeaders();
        headers.addAll(request.headers());
        synchronized (requests) {
            requests.add(new RecordedRequest(request.method(), request.url(), headers, body));
        }
        Function<ClientRequest, Mono<ClientResponse>> responder = queue.poll();
        return (responder != null ? responder : fallback).apply(request);
    }
}
