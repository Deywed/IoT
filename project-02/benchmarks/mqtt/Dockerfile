# emqtt-bench — zvanični MQTT benchmark alat (EMQX).
# Gradi se iz izvora (Erlang). Prvi build traje par minuta (povlači Hex/rebar zavisnosti).
#
# Build:  docker build -t emqtt-bench benchmarks/mqtt
# Run  :  docker run --rm --network project-02_default emqtt-bench pub -h mosquitto -t iot/measurements -c 100 -q 1 -I 10

FROM erlang:26 AS build
RUN git clone --depth 1 https://github.com/emqx/emqtt-bench.git /src
WORKDIR /src
RUN make

FROM erlang:26
COPY --from=build /src /emqtt-bench
WORKDIR /emqtt-bench
# `make` proizvodi escript/binary u ./emqtt_bench (root projekta).
ENTRYPOINT ["/emqtt-bench/emqtt_bench"]
