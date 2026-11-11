{{- define "palmscout.labels" -}}
app.kubernetes.io/name: palmscout
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
{{- define "palmscout.validate" -}}
{{- range $name := list "api" "web" "postgres" "redis" }}
{{- $image := index $.Values.images $name | default "" }}
{{- if not (regexMatch "^[a-zA-Z0-9][a-zA-Z0-9./:_-]*@sha256:[a-f0-9]{64}$" $image) }}
{{- fail (printf "images.%s must be a reviewed repository@sha256 digest" $name) }}
{{- end }}
{{- end }}
{{- range $name := list "api" "web" "postgres" "redis" }}
{{- $replicas := index $.Values.replicas $name }}
{{- if not (regexMatch "^[01]$" (toString $replicas)) }}
{{- fail (printf "replicas.%s must be 0 or 1 for this single-node pilot" $name) }}
{{- end }}
{{- end }}
{{- if or (not (hasPrefix "https://" .Values.frontendOrigin)) (not (hasPrefix "https://" .Values.apiOrigin)) }}
{{- fail "Both proposed public origins must use HTTPS" }}
{{- end }}
{{- if .Values.solveit.enabled }}
{{- if not (regexMatch "^https://[a-zA-Z0-9.-]+(:[0-9]+)?/?$" .Values.solveit.baseUrl) }}
{{- fail "solveit.baseUrl requires an HTTPS origin" }}
{{- end }}
{{- if not (regexMatch "^[a-z0-9][a-z0-9-]{0,62}$" .Values.solveit.existingSecret) }}
{{- fail "solveit.existingSecret is required when enabled" }}
{{- end }}
{{- if not .Values.solveit.egress }}
{{- fail "solveit.egress must explicitly allow the intake destination" }}
{{- end }}
{{- end }}
{{- end }}
