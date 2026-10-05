package com.assistant.drive;

import com.assistant.testsupport.StubExchangeFunction;
import com.assistant.testsupport.StubExchangeFunction.RecordedRequest;
import org.assertj.core.api.InstanceOfAssertFactories;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("DriveService - Drive, Drive Activity and Drive Labels calls")
class DriveServiceTest {

    private StubExchangeFunction http;
    private DriveService driveService;

    @BeforeEach
    void setUp() {
        http = new StubExchangeFunction();
        driveService = new DriveService(http.webClient());
    }

    @Test
    @DisplayName("listFiles requests pageSize, the field mask and folder-first ordering")
    void listFilesWithoutQuery() {
        http.enqueueJson("{\"files\":[{\"id\":\"f1\",\"name\":\"Doc\"}]}");

        Object result = driveService.listFiles(null, 15);

        RecordedRequest request = http.lastRequest();
        assertThat(request.method()).isEqualTo(HttpMethod.GET);
        assertThat(request.uri().getHost()).isEqualTo("www.googleapis.com");
        assertThat(request.uri().getPath()).isEqualTo("/drive/v3/files");
        assertThat(request.queryParam("pageSize")).isEqualTo("15");
        assertThat(request.queryParam("fields"))
                .isEqualTo("files(id,name,mimeType,owners/displayName,owners/photoLink,owners/me,modifiedTime,size)");
        assertThat(request.queryParam("orderBy")).isEqualTo("folder,name");
        assertThat(request.queryParam("q")).isNull();
        assertThat(result).asInstanceOf(InstanceOfAssertFactories.MAP).containsKey("files");
    }

    @Test
    @DisplayName("listFiles forwards a Drive query string")
    void listFilesWithQuery() {
        http.enqueueJson("{\"files\":[]}");

        driveService.listFiles("name contains 'report'", 5);

        assertThat(http.lastRequest().queryParam("q")).isEqualTo("name contains 'report'");
        assertThat(http.lastRequest().queryParam("pageSize")).isEqualTo("5");
    }

    @Test
    @DisplayName("listFiles ignores an empty query")
    void listFilesWithEmptyQuery() {
        http.enqueueJson("{}");

        driveService.listFiles("", 5);

        assertThat(http.lastRequest().queryParam("q")).isNull();
    }

    @Test
    @DisplayName("getFileActivity POSTs an itemName filter to activity:query")
    void getFileActivity() {
        http.enqueueJson("{\"activities\":[]}");

        driveService.getFileActivity("file-42");

        RecordedRequest request = http.lastRequest();
        assertThat(request.method()).isEqualTo(HttpMethod.POST);
        assertThat(request.uri().toString()).isEqualTo("https://driveactivity.googleapis.com/v2/activity:query");
        assertThat(request.body()).isEqualTo("{\"itemName\":\"items/file-42\"}");
    }

    @Test
    @DisplayName("listLabels GETs the Drive Labels API")
    void listLabels() {
        http.enqueueJson("{\"labels\":[{\"id\":\"l1\"}]}");

        Object result = driveService.listLabels();

        assertThat(http.lastRequest().uri().toString()).isEqualTo("https://drivelabels.googleapis.com/v2/labels");
        assertThat(result).asInstanceOf(InstanceOfAssertFactories.MAP).containsKey("labels");
    }

    @Test
    @DisplayName("Upstream errors propagate")
    void upstreamError() {
        http.enqueue(HttpStatus.NOT_FOUND, "{}");

        assertThatThrownBy(() -> driveService.listLabels()).isInstanceOf(WebClientResponseException.NotFound.class);
    }
}
